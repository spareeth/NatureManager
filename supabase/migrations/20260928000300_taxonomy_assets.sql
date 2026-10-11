-- Task 0.4: taxon, org_taxon, asset_type, accession, asset, asset_status_change, media.
-- Spec: docs/DATA_MODEL.md sections 3, 4 and 9; SRS FR-TAX, FR-AST.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True if the user holds any of the roles in the organisation.
create function has_any_role(org uuid, rs text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membership
                 where user_id = auth.uid() and organisation_id = org
                   and active and roles && rs)
$$;

-- True if the user holds the role in any organisation (for shared tables such as taxon).
create function has_role_anywhere(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membership
                 where user_id = auth.uid() and active and r = any(roles))
$$;

revoke execute on function has_any_role(uuid, text[]) from public;
revoke execute on function has_role_anywhere(text) from public;
grant execute on function has_any_role(uuid, text[]) to anon, authenticated;
grant execute on function has_role_anywhere(text) to anon, authenticated;

-- audit_row() now takes an optional key column name for tables without an id column:
--   execute function audit_row('taxon_id')
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  k text := coalesce(tg_argv[0], 'id');
begin
  if tg_op = 'UPDATE' and o = n then
    return null;
  end if;
  insert into audit_log (organisation_id, table_name, row_id, action, old, new, actor)
  values ((r ->> 'organisation_id')::uuid, tg_table_name, (r ->> k)::uuid,
          lower(tg_op), o, n, auth.uid());
  return null;
end
$$;
revoke execute on function audit_row() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Taxonomy (section 3)
-- ---------------------------------------------------------------------------

create table taxon (                     -- shared across organisations (no organisation_id)
  id uuid primary key default gen_random_uuid(),
  kingdom text not null,                 -- Plantae, Animalia, Fungi
  family text, genus text, specific_epithet text,
  infraspecific_rank text, infraspecific_epithet text,
  cultivar text,
  scientific_name text not null,         -- full name without authorship
  authorship text,
  rank text not null                     -- family, genus, species, subspecies, variety, cultivar
    check (rank in ('family', 'genus', 'species', 'subspecies', 'variety', 'form', 'cultivar')),
  accepted_taxon_id uuid references taxon,
  gbif_key bigint,
  common_names jsonb not null default '{}',  -- {"en": [...], "ar": [...]}
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  check (accepted_taxon_id is distinct from id)
);
create unique index on taxon (scientific_name, coalesce(authorship,''));
create index on taxon (accepted_taxon_id);

create table org_taxon (                 -- per-organisation attributes (Hortis custom fields land here)
  organisation_id uuid not null references organisation,
  taxon_id uuid not null references taxon,
  inhouse_code text,                     -- Terra 3-letter species code from tags, e.g. TAM, PRO, ZIZ
  iucn_category text                     -- EX, EW, CR, EN, VU, NT, LC, DD, NE
    check (iucn_category in ('EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE')),
  protection_level text,                 -- Terra/UAE protection classes, catalogue in settings
  origin text                            -- native, endemic, naturalised, exotic, unknown
    check (origin in ('native', 'endemic', 'naturalised', 'exotic', 'unknown')),
  zones_present text[],                  -- location codes
  sensitive boolean not null default false,  -- obscure coordinates
  notes text,
  legacy_hortis_id text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  primary key (organisation_id, taxon_id),
  unique (organisation_id, inhouse_code)
);
create index on org_taxon (taxon_id);

-- ---------------------------------------------------------------------------
-- Assets (section 4)
-- ---------------------------------------------------------------------------

create type asset_class as enum ('living','built');
-- Living lifecycle (FR-AST-09): planned, planted, established, declining, dead, removed.
-- Built lifecycle: planned, active, out_of_service, removed, disposed.
create type asset_status as enum ('planned','planted','established','active','declining','dead',
                                  'removed','out_of_service','disposed');

create table asset_type (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  asset_class asset_class not null,
  code text not null,                    -- PLANT, TREE, GROUP, VALVE, PUMP, SIGN, CAMTRAP, SENSOR, AERATOR
  name text not null,
  attribute_schema jsonb not null default '{}',  -- JSON Schema for asset.attributes
  icon text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, organisation_id)
);

create table accession (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  accession_number text not null,        -- ITF2: accession identifier
  taxon_id uuid not null references taxon,
  received_date date,
  source text,                           -- nursery, donor, wild collection, propagated in-house
  provenance_type text                   -- ITF2: W (wild), Z (wild-derived), G (garden), U (unknown)
    check (provenance_type in ('W', 'Z', 'G', 'U')),
  collector text, collection_locality text, collection_point geometry(Point,4326),
  quantity_received int check (quantity_received >= 0),
  notes text,
  legacy_hortis_id text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, accession_number),
  unique (id, organisation_id)
);
create index on accession (taxon_id);

create table asset (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  location_id uuid references location,  -- auto-set by trigger from geom
  asset_type_id uuid not null references asset_type,
  tag_code text not null,                -- Terra tag, e.g. WG07-T04_PRO (kept from Hortis); new: same pattern
  barcode text,                          -- existing Code 128 if any
  name text,
  geom geometry(Geometry, 4326) not null, -- point or polygon
  local_x numeric(10,2), local_y numeric(10,2),  -- site grid metres, kept by trigger
  position_source text                   -- gps, rtk, offset, cad, hortis, bed_centroid
    check (position_source in ('gps', 'rtk', 'offset', 'cad', 'hortis', 'bed_centroid')),
  position_accuracy_m numeric,
  status asset_status not null default 'active',
  condition smallint check (condition between 1 and 5),
  criticality smallint check (criticality between 1 and 5),
  install_date date,
  -- living assets
  taxon_id uuid references taxon,
  accession_id uuid references accession,
  parent_asset_id uuid references asset,
  plant_count int check (plant_count >= 0),
  attributes jsonb not null default '{}',
  legacy_hortis_id text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, tag_code),
  unique (id, organisation_id),
  -- every reference stays inside the asset's organisation (and site for location)
  foreign key (site_id, organisation_id) references site (id, organisation_id),
  foreign key (location_id, site_id) references location (id, site_id),
  foreign key (asset_type_id, organisation_id) references asset_type (id, organisation_id),
  foreign key (accession_id, organisation_id) references accession (id, organisation_id),
  foreign key (parent_asset_id, organisation_id) references asset (id, organisation_id),
  check (parent_asset_id is distinct from id),
  check (st_isvalid(geom)),
  check (geometrytype(geom) in ('POINT', 'POLYGON', 'MULTIPOLYGON'))
);
create index on asset using gist (geom);
create index on asset (site_id);
create index on asset (location_id);
create index on asset (asset_type_id);
create index on asset (taxon_id);
create index on asset (accession_id);
create index on asset (parent_asset_id);
create index on asset (organisation_id, barcode) where barcode is not null;

create table asset_status_change (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  asset_id uuid not null references asset,
  from_status asset_status, to_status asset_status not null,
  reason text, changed_at timestamptz not null default now(), changed_by uuid,
  foreign key (asset_id, organisation_id) references asset (id, organisation_id)
);
create index on asset_status_change (asset_id, changed_at);

create table media (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  bucket text not null                   -- Supabase Storage buckets
    check (bucket in ('photos', 'sop-media', 'audio')),
  path text not null,                    -- <organisation_id>/...
  kind text not null                     -- photo, audio, video, document
    check (kind in ('photo', 'audio', 'video', 'document')),
  taken_at timestamptz, geom geometry(Point,4326),
  asset_id uuid references asset, work_order_id uuid, observation_id uuid,
  caption text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (bucket, path),
  foreign key (asset_id, organisation_id) references asset (id, organisation_id),
  check (split_part(path, '/', 1) = organisation_id::text)
);
create index on media (asset_id);
create index on media (work_order_id);
create index on media (observation_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger taxon_updated_at before update on taxon
  for each row execute function set_updated_at();
create trigger org_taxon_updated_at before update on org_taxon
  for each row execute function set_updated_at();
create trigger asset_type_updated_at before update on asset_type
  for each row execute function set_updated_at();
create trigger accession_updated_at before update on accession
  for each row execute function set_updated_at();
create trigger asset_updated_at before update on asset
  for each row execute function set_updated_at();
create trigger media_updated_at before update on media
  for each row execute function set_updated_at();

create trigger asset_audit after insert or update or delete on asset
  for each row execute function audit_row();
create trigger org_taxon_audit after insert or update or delete on org_taxon
  for each row execute function audit_row('taxon_id');

-- Asset position and class rules (before insert/update):
-- * status must fit the asset class (living vs built lifecycle);
-- * local_x, local_y from the site grid (centroid for polygons, COORDINATES.md section 2);
-- * location_id from geom (FR-SITE-07), unless the caller sets location_id explicitly.
create function asset_before_write() returns trigger
language plpgsql set search_path = public, extensions as $$
declare
  cls asset_class;
  l geometry;
begin
  select asset_class into cls from asset_type where id = new.asset_type_id;
  if cls = 'living' and new.status in ('active', 'out_of_service', 'disposed') then
    raise exception 'status % is not valid for a living asset', new.status using errcode = '23514';
  elsif cls = 'built' and new.status in ('planted', 'established', 'declining', 'dead') then
    raise exception 'status % is not valid for a built asset', new.status using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.geom is distinct from old.geom or new.site_id is distinct from old.site_id then
    l := site_to_local(new.site_id,
                       case when geometrytype(new.geom) = 'POINT' then new.geom else st_centroid(new.geom) end);
    new.local_x := round(st_x(l)::numeric, 2);
    new.local_y := round(st_y(l)::numeric, 2);

    if (tg_op = 'INSERT' and new.location_id is null)
       or (tg_op = 'UPDATE' and new.location_id is not distinct from old.location_id) then
      new.location_id := resolve_location(new.geom, new.site_id);
    end if;
  end if;
  return new;
end
$$;
create trigger asset_before_write before insert or update on asset
  for each row execute function asset_before_write();

-- Every status change is recorded (FR-AST-07, FR-AST-09). Reason comes from
-- asset_set_status() via the transaction setting app.status_reason.
create function asset_log_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into asset_status_change (organisation_id, asset_id, from_status, to_status, reason, changed_by)
    values (new.organisation_id, new.id,
            case when tg_op = 'UPDATE' then old.status end, new.status,
            nullif(current_setting('app.status_reason', true), ''), auth.uid());
  end if;
  return null;
end
$$;
revoke execute on function asset_log_status() from public, anon, authenticated;
create trigger asset_log_status after insert or update of status on asset
  for each row execute function asset_log_status();

-- Change an asset's status with a reason. Security invoker: RLS on asset applies.
create function asset_set_status(p_asset uuid, p_status asset_status, p_reason text default null)
returns void language plpgsql set search_path = public as $$
begin
  perform set_config('app.status_reason', coalesce(p_reason, ''), true);
  update asset set status = p_status where id = p_asset;
  if not found then
    raise exception 'asset % not found', p_asset using errcode = 'P0002';
  end if;
  perform set_config('app.status_reason', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- taxon is shared: any signed-in user reads; curators (of any organisation) add
-- names. Edits and deletes of shared names are a service-role task.
alter table taxon enable row level security;
create policy taxon_read on taxon for select to authenticated using (true);
create policy taxon_insert on taxon for insert to authenticated
  with check (has_role_anywhere('curator'));

-- org_taxon: status fields are curator-only (FR-TAX-05).
alter table org_taxon enable row level security;
create policy org_taxon_read on org_taxon for select
  using (organisation_id in (select auth_org_ids()));
create policy org_taxon_write on org_taxon for all
  using (has_role(organisation_id, 'curator'))
  with check (has_role(organisation_id, 'curator'));

alter table asset_type enable row level security;
create policy asset_type_read on asset_type for select
  using (organisation_id in (select auth_org_ids()));
create policy asset_type_write on asset_type for all
  using (has_role(organisation_id, 'manager'))
  with check (has_role(organisation_id, 'manager'));

alter table accession enable row level security;
create policy accession_read on accession for select
  using (organisation_id in (select auth_org_ids()));
create policy accession_write on accession for all
  using (has_any_role(organisation_id, array['manager', 'curator']))
  with check (has_any_role(organisation_id, array['manager', 'curator']));

-- asset and media: every working role writes; owner is read-only.
alter table asset enable row level security;
create policy asset_read on asset for select
  using (organisation_id in (select auth_org_ids()));
create policy asset_write on asset for all
  using (has_any_role(organisation_id,
         array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer']))
  with check (has_any_role(organisation_id,
         array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer']));

-- asset_status_change: read-only history, written by asset_log_status().
alter table asset_status_change enable row level security;
create policy asset_status_change_read on asset_status_change for select
  using (organisation_id in (select auth_org_ids()));

alter table media enable row level security;
create policy media_read on media for select
  using (organisation_id in (select auth_org_ids()));
create policy media_write on media for all
  using (has_any_role(organisation_id,
         array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer']))
  with check (has_any_role(organisation_id,
         array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer']));

-- ---------------------------------------------------------------------------
-- Storage buckets (NFR-01): objects live under <organisation_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('sop-media', 'sop-media', false),
  ('audio', 'audio', false)
on conflict (id) do nothing;

create policy tg_media_read on storage.objects for select to authenticated
  using (bucket_id in ('photos', 'sop-media', 'audio')
         and (storage.foldername(name))[1] in (select auth_org_ids()::text));
create policy tg_media_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'sop-media', 'audio')
              and exists (select 1 from auth_org_ids() o
                          where o::text = (storage.foldername(name))[1]
                            and has_any_role(o, array['manager', 'field_manager', 'curator',
                                                      'green_team', 'field_engineer'])));
create policy tg_media_delete on storage.objects for delete to authenticated
  using (bucket_id in ('photos', 'sop-media', 'audio')
         and exists (select 1 from auth_org_ids() o
                     where o::text = (storage.foldername(name))[1]
                       and has_role(o, 'manager')));
