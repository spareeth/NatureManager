-- Base maps per site (decision 24 Oct 2026): a list of layers instead of the single site.basemap_url.
-- Each layer says whether its tiles may be stored on phones for offline use. Google and Esri imagery
-- may not (their terms), so the check below refuses offline_allowed for them.

create table site_basemap (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null,
  name text not null,
  kind text not null check (kind in ('xyz', 'google', 'esri')),
  url text,                              -- xyz only: https://host/{z}/{x}/{y}.png (or {y}/{x} as the server needs)
  attribution text,
  min_zoom int not null default 0 check (min_zoom between 0 and 24),
  max_zoom int not null default 22 check (max_zoom between 0 and 24),
  max_native_zoom int not null default 19 check (max_native_zoom between 0 and 24),
  offline_allowed boolean not null default false,
  is_default boolean not null default false,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (site_id, name),
  foreign key (site_id, organisation_id) references site (id, organisation_id) on delete cascade,
  check (min_zoom <= max_zoom and max_native_zoom <= max_zoom),
  check (kind <> 'xyz' or (url ~ '^https?://' and url like '%{z}%' and url like '%{x}%' and url like '%{y}%')),
  check (kind = 'xyz' or url is null),
  check (kind = 'xyz' or not offline_allowed)
);
create unique index site_basemap_one_default on site_basemap (site_id) where is_default and active;
create trigger site_basemap_updated_at before update on site_basemap for each row execute function set_updated_at();
create trigger site_basemap_audit after insert or update or delete on site_basemap for each row execute function audit_row();

alter table site_basemap enable row level security;
create policy site_basemap_read on site_basemap for select using (organisation_id in (select auth_org_ids()));
create policy site_basemap_write on site_basemap for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

-- Make one layer the default of its site (clears the others in the same statement order).
create function site_basemap_set_default(p_basemap uuid) returns void
language plpgsql set search_path = public as $$
declare b site_basemap;
begin
  select * into b from site_basemap where id = p_basemap;
  if not found then
    raise exception 'base map not found' using errcode = 'P0002';
  end if;
  update site_basemap set is_default = false where site_id = b.site_id and is_default and id <> p_basemap;
  update site_basemap set is_default = true, active = true where id = p_basemap;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end
$$;
revoke execute on function site_basemap_set_default(uuid) from public, anon;
grant execute on function site_basemap_set_default(uuid) to authenticated;

-- Standard layers for a site: OpenStreetMap, Google satellite (default; shown when the app has a
-- Google key), Esri World Imagery (shown when the app has an Esri key), and the old basemap_url.
create function site_basemap_defaults(p_site uuid) returns void
language sql set search_path = public as $$
  insert into site_basemap (organisation_id, site_id, name, kind, url, attribution, max_native_zoom, offline_allowed, is_default, sort_order)
  select s.organisation_id, s.id, v.name, v.kind, v.url, v.attribution, v.native, v.offline, v.dflt, v.sort
  from site s, (values
    ('OpenStreetMap', 'xyz', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors', 19, true, false, 10),
    ('Google satellite', 'google', null, null, 21, false, true, 20),
    ('Esri World Imagery', 'esri', null, 'Powered by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', 19, false, false, 30)
  ) v(name, kind, url, attribution, native, offline, dflt, sort)
  where s.id = p_site
  on conflict (site_id, name) do nothing;
  -- the earlier single orthophoto URL becomes the site's own layer and its default
  insert into site_basemap (organisation_id, site_id, name, kind, url, offline_allowed, is_default, sort_order, max_native_zoom)
  select organisation_id, id, 'Site orthophoto', 'xyz', basemap_url, true, false, 5, 22 from site
  where id = p_site and basemap_url is not null
  on conflict (site_id, name) do nothing;
  update site_basemap set is_default = (name = 'Site orthophoto')
  where site_id = p_site and exists (select 1 from site_basemap where site_id = p_site and name = 'Site orthophoto');
$$;
revoke execute on function site_basemap_defaults(uuid) from public, anon, authenticated;

select site_basemap_defaults(id) from site;

comment on column site.basemap_url is 'Deprecated (24 Oct 2026): use site_basemap. Kept for existing data.';
