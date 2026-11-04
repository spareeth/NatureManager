-- Task 3.1: observations and AI suggestions (FR-OBS-01..04; DATA_MODEL section 6).
-- As modelled, plus (CLAUDE.md rule 1 and the pattern of earlier phases) organisation_id composite keys,
-- created/updated columns, checks on the listed values, the location set from the point, and rules on
-- who may change the verification status.

alter table media add constraint media_id_organisation_id_key unique (id, organisation_id);

create table observation (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null,
  location_id uuid,
  obs_type text not null check (obs_type in ('flora', 'fauna', 'phenology', 'pest_disease', 'plant_health',
                                            'water_quality', 'note')),
  observed_at timestamptz not null default now(),
  geom geometry(Point, 4326) not null,
  gps_accuracy_m numeric check (gps_accuracy_m >= 0),
  observer uuid not null default auth.uid() references auth.users,
  asset_id uuid,
  taxon_id uuid references taxon,
  count int check (count >= 0),
  life_stage text,
  behaviour text,
  phenophase text check (phenophase in ('leafing', 'flowering', 'fruiting', 'senescence')),
  severity smallint check (severity between 1 and 5),
  measurements jsonb not null default '{}',
  verification text not null default 'ai_suggested'
    check (verification in ('ai_suggested', 'observer_confirmed', 'curator_verified', 'rejected')),
  verified_by uuid references auth.users,
  verified_at timestamptz,
  notes text,
  client_uuid uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (site_id, organisation_id) references site (id, organisation_id),
  foreign key (location_id, organisation_id) references location (id, organisation_id),
  foreign key (asset_id, organisation_id) references asset (id, organisation_id) on delete set null (asset_id),
  check (obs_type <> 'phenology' or phenophase is not null),
  check (jsonb_typeof(measurements) = 'object')
);
create index on observation using gist (geom);
create index on observation (organisation_id, observed_at desc);
create index on observation (taxon_id);
create index on observation (asset_id);

create table ai_suggestion (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  observation_id uuid not null,
  media_id uuid,
  engine text not null check (engine in ('plantnet', 'bioclip2', 'speciesnet', 'birdnet', 'inat')),
  model_version text,
  rank int not null check (rank >= 1),
  taxon_name text not null,
  taxon_id uuid references taxon,
  score numeric not null check (score >= 0 and score <= 1),
  in_collection boolean,
  raw jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  unique (observation_id, engine, media_id, rank),
  foreign key (observation_id, organisation_id) references observation (id, organisation_id) on delete cascade,
  foreign key (media_id, organisation_id) references media (id, organisation_id) on delete set null (media_id)
);
create index on ai_suggestion (observation_id, rank);

-- Photos and audio of an observation.
alter table media add foreign key (observation_id, organisation_id) references observation (id, organisation_id)
  on delete cascade;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger observation_updated_at before update on observation for each row execute function set_updated_at();
create trigger observation_audit after insert or update or delete on observation for each row execute function audit_row();

-- The bed or zone from the point (FR-OBS-02 "location (auto)") unless the caller names one; the observer
-- is the signed-in user; the verification status follows FR-OBS-04:
--   ai_suggested / observer_confirmed: the observer (or a curator or manager)
--   curator_verified / rejected: a curator or manager only, recording who and when.
create function observation_before_write() returns trigger
language plpgsql set search_path = public, extensions as $$
declare me uuid := auth.uid();
begin
  if tg_op = 'INSERT' and new.location_id is null then
    new.location_id := resolve_location(new.geom, new.site_id);
  elsif tg_op = 'UPDATE' and new.geom is distinct from old.geom and new.location_id is not distinct from old.location_id then
    new.location_id := resolve_location(new.geom, new.site_id);  -- the point moved: its bed again
  end if;
  if me is null then
    return new;  -- system work (imports, simulation) is not limited
  end if;
  if tg_op = 'INSERT' then
    if new.observer is distinct from me then
      raise exception 'observations are recorded by the signed-in observer' using errcode = '42501';
    end if;
    if new.verification in ('curator_verified', 'rejected') then
      raise exception 'a new observation is ai_suggested or observer_confirmed' using errcode = '42501';
    end if;
  elsif new.observer is distinct from old.observer then
    raise exception 'the observer of an observation does not change' using errcode = '42501';
  end if;
  if new.verification in ('curator_verified', 'rejected')
     and (tg_op = 'INSERT' or new.verification is distinct from old.verification) then
    if not has_any_role(new.organisation_id, array['curator', 'manager']) then
      raise exception 'only curators and managers verify or reject observations' using errcode = '42501';
    end if;
    new.verified_by := me;
    new.verified_at := now();
  elsif tg_op = 'UPDATE' and old.verification in ('curator_verified', 'rejected')
        and not has_any_role(new.organisation_id, array['curator', 'manager']) then
    raise exception 'a verified or rejected observation is changed by curators and managers only' using errcode = '42501';
  elsif new.verification in ('ai_suggested', 'observer_confirmed') then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end
$$;
create trigger observation_before_write before insert or update on observation
  for each row execute function observation_before_write();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table observation enable row level security;
create policy observation_read on observation for select using (organisation_id in (select auth_org_ids()));
-- Working roles record their own observations.
create policy observation_insert on observation for insert with check (
  has_any_role(organisation_id, array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer'])
  and observer = auth.uid());
-- The observer edits their own; curators and managers edit any (verification rules in the trigger).
create policy observation_update on observation for update
  using (has_any_role(organisation_id, array['curator', 'manager'])
         or (observer = auth.uid() and has_any_role(organisation_id, array['field_manager', 'green_team', 'field_engineer'])))
  with check (has_any_role(organisation_id, array['curator', 'manager'])
              or (observer = auth.uid() and has_any_role(organisation_id, array['field_manager', 'green_team', 'field_engineer'])));
create policy observation_delete on observation for delete
  using (has_any_role(organisation_id, array['curator', 'manager'])
         or (observer = auth.uid() and verification in ('ai_suggested', 'observer_confirmed')
             and has_any_role(organisation_id, array['field_manager', 'green_team', 'field_engineer'])));

-- Suggestions: added by the observer of the observation or a curator or manager; never edited.
alter table ai_suggestion enable row level security;
create policy ai_suggestion_read on ai_suggestion for select using (organisation_id in (select auth_org_ids()));
create policy ai_suggestion_insert on ai_suggestion for insert with check (
  has_any_role(organisation_id, array['curator', 'manager'])
  or exists (select 1 from observation o where o.id = observation_id and o.observer = auth.uid()
             and has_any_role(o.organisation_id, array['field_manager', 'green_team', 'field_engineer'])));
create policy ai_suggestion_delete on ai_suggestion for delete
  using (has_any_role(organisation_id, array['curator', 'manager']));
