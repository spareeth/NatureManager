-- Task 1.8: control points with residuals, and offset placement (FR-SITE-10, FR-SITE-11,
-- docs/COORDINATES.md sections 3 and 4). All transforms stay in the database (CLAUDE.md rule 2).

-- Reference position of a marker on the site grid, from the plan, CAD drawing or design
-- (decision 11 Oct 2026). Residual = surveyed geom versus site_from_local(ref_x, ref_y).
alter table control_point
  add column ref_x numeric(12, 3),
  add column ref_y numeric(12, 3),
  add column ref_source text,            -- plan, cad, design, gcp_file
  add constraint control_point_ref_both check ((ref_x is null) = (ref_y is null));

-- Any geometry in local site grid coordinates (SRID 0) back to WGS 84: the inverse of
-- site_to_local for whole geometries (lines, polygons), using the same terms as site_from_local.
create function site_geom_from_local(p_site uuid, p_geom geometry)
returns geometry language sql stable set search_path = public, extensions as $$
  select st_transform(
           st_setsrid(
             st_translate(
               st_rotate(st_scale(st_setsrid(p_geom, 0), s.grid_scale, s.grid_scale),
                         radians(s.grid_rotation_deg), 0, 0),
               s.grid_origin_e, s.grid_origin_n),
             3997),
           4326)
  from site s where s.id = p_site
$$;

-- Shift a geometry by dx, dy metres along the site grid axes (offset placement; moves whole
-- polygons for planting groups).
create function site_offset_geom(p_site uuid, p_geom geometry, p_dx double precision, p_dy double precision)
returns geometry language sql stable set search_path = public, extensions as $$
  select site_geom_from_local(p_site, st_translate(site_to_local(p_site, p_geom), p_dx, p_dy))
$$;

-- A position typed in one of three systems, returned in all of them:
--   p_system 'wgs84' (a = lon, b = lat), 'dltm' (EPSG:3997, a = E, b = N), 'grid' (site x, y).
create function site_point(p_site uuid, p_system text, p_a double precision, p_b double precision)
returns jsonb language sql stable set search_path = public, extensions as $$
  with g as (
    select case p_system
      when 'wgs84' then st_setsrid(st_makepoint(p_a, p_b), 4326)
      when 'dltm' then st_transform(st_setsrid(st_makepoint(p_a, p_b), 3997), 4326)
      when 'grid' then site_from_local(p_site, p_a, p_b)
    end as p
  )
  select jsonb_build_object(
    'lon', round(st_x(p)::numeric, 10), 'lat', round(st_y(p)::numeric, 10),
    'e', round(st_x(st_transform(p, 3997))::numeric, 3), 'n', round(st_y(st_transform(p, 3997))::numeric, 3),
    'x', round(st_x(site_to_local(p_site, p))::numeric, 3), 'y', round(st_y(site_to_local(p_site, p))::numeric, 3))
  from g where p is not null and exists (select 1 from site where id = p_site)
$$;

-- Nearest bed corner (polygon vertex) to a clicked point, within p_max_m metres, as a start
-- point for offsets. Returns null when no corner is that close.
create function nearest_bed_corner(p_site uuid, p_lon double precision, p_lat double precision,
                                   p_max_m double precision default 3)
returns jsonb language sql stable set search_path = public, extensions as $$
  with click as (select st_transform(st_setsrid(st_makepoint(p_lon, p_lat), 4326), 3997) as c),
  corners as (
    select l.code, (d).path[array_length((d).path, 1)] as vertex, (d).geom as g
    from location l, lateral st_dumppoints(l.geom) d
    where l.site_id = p_site and l.kind <> 'zone'
  )
  select jsonb_build_object(
    'code', k.code, 'vertex', k.vertex,
    'lon', round(st_x(k.g)::numeric, 10), 'lat', round(st_y(k.g)::numeric, 10),
    'x', round(st_x(site_to_local(p_site, k.g))::numeric, 3), 'y', round(st_y(site_to_local(p_site, k.g))::numeric, 3),
    'distance_m', round(st_distance(st_transform(k.g, 3997), click.c)::numeric, 2))
  from corners k, click
  where st_dwithin(st_transform(k.g, 3997), click.c, p_max_m)
  order by st_distance(st_transform(k.g, 3997), click.c)
  limit 1
$$;

-- Control points of a site with grid and Dubai TM coordinates and residuals (FR-SITE-10).
create function control_point_list(p_site uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  with cp as (
    select c.*, site_to_local(p_site, c.geom) as l, st_transform(c.geom, 3997) as m
    from control_point c where c.site_id = p_site
  ),
  rows as (
    select cp.id, cp.code, cp.description, cp.source, cp.accuracy_m, cp.surveyed_at, cp.ref_source,
           round(st_y(cp.geom)::numeric, 10) as lat, round(st_x(cp.geom)::numeric, 10) as lon,
           round(st_x(cp.m)::numeric, 3) as e, round(st_y(cp.m)::numeric, 3) as n,
           round(st_x(cp.l)::numeric, 3) as x, round(st_y(cp.l)::numeric, 3) as y,
           cp.ref_x, cp.ref_y,
           case when cp.ref_x is not null then round((st_x(cp.l) - cp.ref_x)::numeric, 3) end as dx,
           case when cp.ref_x is not null then round((st_y(cp.l) - cp.ref_y)::numeric, 3) end as dy,
           case when cp.ref_x is not null then round(sqrt((st_x(cp.l) - cp.ref_x) ^ 2 + (st_y(cp.l) - cp.ref_y) ^ 2)::numeric, 3) end as residual_m
    from cp
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.code) from rows r), '[]'::jsonb),
    'with_reference', (select count(*) from rows where residual_m is not null),
    'rmse_m', (select round(sqrt(avg(residual_m ^ 2))::numeric, 3) from rows where residual_m is not null),
    'max_m', (select max(residual_m) from rows))
$$;

revoke execute on function site_geom_from_local(uuid, geometry) from public, anon;
revoke execute on function site_offset_geom(uuid, geometry, double precision, double precision) from public, anon;
revoke execute on function site_point(uuid, text, double precision, double precision) from public, anon;
revoke execute on function nearest_bed_corner(uuid, double precision, double precision, double precision) from public, anon;
revoke execute on function control_point_list(uuid) from public, anon;
grant execute on function site_geom_from_local(uuid, geometry) to authenticated;
grant execute on function site_offset_geom(uuid, geometry, double precision, double precision) to authenticated;
grant execute on function site_point(uuid, text, double precision, double precision) to authenticated;
grant execute on function nearest_bed_corner(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function control_point_list(uuid) to authenticated;

-- Move an asset (point or polygon) by dx, dy metres on the site grid in one update, recording
-- the position source and accuracy. Security invoker: RLS on asset decides who may move it.
-- location_id is left unchanged so the asset trigger re-resolves the bed from the new geometry.
create function asset_move_offset(p_asset uuid, p_dx double precision, p_dy double precision,
                                  p_accuracy numeric default null)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  r record;
begin
  update asset a
     set geom = site_offset_geom(a.site_id, a.geom, p_dx, p_dy),
         position_source = 'offset',
         position_accuracy_m = p_accuracy
   where a.id = p_asset
  returning a.id, a.local_x, a.local_y into r;
  if not found then
    raise exception 'asset % not found', p_asset using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', r.id, 'local_x', r.local_x, 'local_y', r.local_y);
end
$$;
revoke execute on function asset_move_offset(uuid, double precision, double precision, numeric) from public, anon;
grant execute on function asset_move_offset(uuid, double precision, double precision, numeric) to authenticated;
