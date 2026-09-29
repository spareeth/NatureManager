-- Task 0.3: site (with grid), location, line_feature, control_point; resolve_location;
-- site_to_local / site_from_local.
-- Spec: docs/DATA_MODEL.md section 2, docs/COORDINATES.md; SRS FR-SITE-02..08.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table site (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  code text not null,                    -- TG (pilot); EV later
  name text not null,                    -- Terra Garden
  site_type text not null,               -- botanical_garden, nature_reserve, park, campus
  boundary geometry(MultiPolygon, 4326) not null,
  basemap_url text,                      -- XYZ or COG orthophoto
  grid_name text,                        -- Terra Garden Grid 2026
  grid_origin_e double precision,        -- EPSG:3997 easting of grid origin
  grid_origin_n double precision,        -- EPSG:3997 northing of grid origin
  grid_rotation_deg double precision not null default 0,  -- ccw from EPSG:3997 easting axis
  grid_scale double precision not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, organisation_id),
  check (grid_scale > 0),
  check ((grid_origin_e is null) = (grid_origin_n is null)),
  check (st_isvalid(boundary))
);
create index on site using gist (boundary);

create table control_point (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  code text not null,                    -- CP-01, SG-03-A
  description text,
  geom geometry(Point, 4326) not null,
  source text not null,                  -- rtk, cad, gcp_file, total_station
  accuracy_m numeric,
  surveyed_at date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  foreign key (site_id, organisation_id) references site (id, organisation_id)
);
create index on control_point using gist (geom);
create index on control_point (site_id);

create type location_kind as enum ('zone','bed','habitat','water_body','building','sub_area','other');

create table location (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  parent_id uuid references location,
  kind location_kind not null,
  code text not null,                    -- zones EG, NG, SG, WG; beds EG-01 .. WG-10 (Hortis location names)
  name text not null,
  geom geometry(MultiPolygon, 4326) not null,
  area_m2 numeric generated always as (st_area(geom::geography)) stored,
  attributes jsonb not null default '{}', -- soil, irrigation type, habitat class, water depth
  legacy_hortis_id text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, site_id),
  foreign key (site_id, organisation_id) references site (id, organisation_id),
  -- parent must be in the same site (and so the same organisation)
  foreign key (parent_id, site_id) references location (id, site_id),
  check (parent_id is distinct from id),
  check (st_isvalid(geom))
);
create index on location using gist (geom);
create index on location (site_id);
create index on location (parent_id);

create table line_feature (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  site_id uuid not null references site,
  kind text not null,                    -- path, irrigation_main, irrigation_lateral, stream, fence
  name text,
  geom geometry(MultiLineString, 4326) not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  foreign key (site_id, organisation_id) references site (id, organisation_id)
);
create index on line_feature using gist (geom);
create index on line_feature (site_id);

create trigger site_updated_at before update on site
  for each row execute function set_updated_at();
create trigger control_point_updated_at before update on control_point
  for each row execute function set_updated_at();
create trigger location_updated_at before update on location
  for each row execute function set_updated_at();
create trigger line_feature_updated_at before update on line_feature
  for each row execute function set_updated_at();

-- DATA_MODEL section 9: location is audited.
create trigger location_audit after insert or update or delete on location
  for each row execute function audit_row();

-- ---------------------------------------------------------------------------
-- RLS: members read; site and grid edited by managers; spatial features by
-- managers and field managers.
-- ---------------------------------------------------------------------------

alter table site enable row level security;
create policy site_read on site for select
  using (organisation_id in (select auth_org_ids()));
create policy site_write on site for all
  using (has_role(organisation_id, 'manager'))
  with check (has_role(organisation_id, 'manager'));

alter table control_point enable row level security;
create policy control_point_read on control_point for select
  using (organisation_id in (select auth_org_ids()));
create policy control_point_write on control_point for all
  using (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'))
  with check (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'));

alter table location enable row level security;
create policy location_read on location for select
  using (organisation_id in (select auth_org_ids()));
create policy location_write on location for all
  using (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'))
  with check (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'));

alter table line_feature enable row level security;
create policy line_feature_read on line_feature for select
  using (organisation_id in (select auth_org_ids()));
create policy line_feature_write on line_feature for all
  using (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'))
  with check (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'));

-- ---------------------------------------------------------------------------
-- Site grid transforms (COORDINATES.md section 2). Security invoker: RLS on
-- site means callers can only use grids of their own organisations.
-- ---------------------------------------------------------------------------

-- Any SRID geometry -> local site grid (SRID 0, metres).
create function site_to_local(p_site uuid, p_geom geometry)
returns geometry language sql stable set search_path = public, extensions as $$
  select st_setsrid(
           st_scale(
             st_rotate(
               st_translate(st_transform(p_geom, 3997), -s.grid_origin_e, -s.grid_origin_n),
               -radians(s.grid_rotation_deg), 0, 0),
             1 / s.grid_scale, 1 / s.grid_scale),
           0)
  from site s where s.id = p_site
$$;

-- Local x, y -> WGS 84 point.
create function site_from_local(p_site uuid, p_x double precision, p_y double precision)
returns geometry language sql stable set search_path = public, extensions as $$
  select st_transform(
           st_setsrid(
             st_translate(
               st_rotate(st_scale(st_makepoint(p_x, p_y), s.grid_scale, s.grid_scale),
                         radians(s.grid_rotation_deg), 0, 0),
               s.grid_origin_e, s.grid_origin_n),
             3997),
           4326)
  from site s where s.id = p_site
$$;

-- ---------------------------------------------------------------------------
-- Point-in-polygon (FR-SITE-07): the most specific (smallest) location that
-- covers the point. Polygons resolve by a point on their surface. Optional
-- p_site narrows the search (service-role scripts see every organisation).
-- ---------------------------------------------------------------------------

create function resolve_location(p_geom geometry, p_site uuid default null)
returns uuid language sql stable set search_path = public, extensions as $$
  with pt as (
    select case when st_dimension(g) = 0 and st_numgeometries(g) = 1 then g
                else st_pointonsurface(g) end as g
    from (select st_transform(p_geom, 4326) as g) t
  )
  select l.id
  from location l, pt
  where st_covers(l.geom, pt.g)
    and (p_site is null or l.site_id = p_site)
  order by l.area_m2 asc
  limit 1
$$;
