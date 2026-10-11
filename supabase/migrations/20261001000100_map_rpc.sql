-- Task 1.2: read functions for the map page (FR-SITE-06, FR-SITE-09, NFR-02).
-- All security invoker: RLS on site, location and asset decides what the caller sees.

-- Site header for the map: boundary, bounding box, basemap.
create function map_site(p_site uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', s.id, 'code', s.code, 'name', s.name, 'site_type', s.site_type,
    'basemap_url', s.basemap_url, 'grid_name', s.grid_name,
    'has_grid', s.grid_origin_e is not null,
    'boundary', st_asgeojson(s.boundary, 7)::jsonb,
    'bbox', jsonb_build_array(st_xmin(s.boundary), st_ymin(s.boundary), st_xmax(s.boundary), st_ymax(s.boundary)))
  from site s where s.id = p_site
$$;

-- Locations of a site as a GeoJSON FeatureCollection. zone_code is the code of the top-level
-- ancestor (the zone for beds), used to colour beds by zone.
create function map_locations(p_site uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  with recursive tree as (
    select id, id as root_id from location where site_id = p_site and parent_id is null
    union all
    select l.id, t.root_id from location l join tree t on l.parent_id = t.id
  )
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
           jsonb_build_object(
             'type', 'Feature', 'id', l.id,
             'geometry', st_asgeojson(l.geom, 7)::jsonb,
             'properties', jsonb_build_object(
               'id', l.id, 'code', l.code, 'name', l.name, 'kind', l.kind,
               'parent_id', l.parent_id, 'zone_code', r.code,
               'area_m2', round(l.area_m2, 1)))
           order by l.kind, l.code), '[]'::jsonb))
  from location l
  join tree t on t.id = l.id
  join location r on r.id = t.root_id
$$;

-- Asset points inside a bounding box (WGS 84 degrees), in a compact row format so 10,000
-- points stay small on a phone connection (NFR-02): each row is
-- [lon, lat, tag_code, status, asset_class]. Polygons are returned as a point on their surface.
-- Details for one asset come from map_asset_detail when it is clicked. p_limit caps the rows;
-- truncated tells the map that more assets exist in the box.
create function map_assets(p_site uuid, p_west double precision, p_south double precision,
                           p_east double precision, p_north double precision, p_limit int default 20000)
returns jsonb language sql stable set search_path = public, extensions as $$
  with box as (select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as g),
  lim as (select greatest(least(p_limit, 50000), 0) as n),
  hits as (
    select a.tag_code, a.status, t.asset_class,
           case when geometrytype(a.geom) = 'POINT' then a.geom else st_pointonsurface(a.geom) end as pt
    from asset a
    join asset_type t on t.id = a.asset_type_id
    , box
    where a.site_id = p_site and a.geom && box.g and st_intersects(a.geom, box.g)
    order by a.tag_code
    limit (select n + 1 from lim)
  ),
  numbered as (select h.*, row_number() over (order by h.tag_code) as rn from hits h)
  select jsonb_build_object(
    'columns', jsonb_build_array('lon', 'lat', 'tag_code', 'status', 'asset_class'),
    'truncated', (select count(*) from numbered) > (select n from lim),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(
               round(st_x(pt)::numeric, 7), round(st_y(pt)::numeric, 7), tag_code, status, asset_class)
               order by tag_code)
             from numbered where rn <= (select n from lim)), '[]'::jsonb))
$$;

-- Popup details for one asset of a site, by tag code.
create function map_asset_detail(p_site uuid, p_tag text)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', a.id, 'tag_code', a.tag_code, 'name', a.name, 'status', a.status,
    'asset_class', t.asset_class, 'type_code', t.code, 'type_name', t.name,
    'scientific_name', tx.scientific_name, 'location_code', l.code,
    'local_x', a.local_x, 'local_y', a.local_y, 'position_source', a.position_source,
    'condition', a.condition)
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join location l on l.id = a.location_id
  where a.site_id = p_site and a.tag_code = p_tag
$$;

-- Site grid x, y (metres, 2 decimals) for a WGS 84 lon/lat, for the cursor readout.
-- Uses site_to_local so the transform is never done in the frontend (CLAUDE.md rule 2).
create function site_local_xy(p_site uuid, p_lon double precision, p_lat double precision)
returns table (x numeric, y numeric) language sql stable set search_path = public, extensions as $$
  select round(st_x(g)::numeric, 2), round(st_y(g)::numeric, 2)
  from (select site_to_local(p_site, st_setsrid(st_makepoint(p_lon, p_lat), 4326)) as g) t
  where g is not null
$$;

revoke execute on function map_site(uuid) from public, anon;
revoke execute on function map_locations(uuid) from public, anon;
revoke execute on function map_assets(uuid, double precision, double precision, double precision, double precision, int) from public, anon;
revoke execute on function map_asset_detail(uuid, text) from public, anon;
revoke execute on function site_local_xy(uuid, double precision, double precision) from public, anon;
grant execute on function map_site(uuid) to authenticated;
grant execute on function map_locations(uuid) to authenticated;
grant execute on function map_assets(uuid, double precision, double precision, double precision, double precision, int) to authenticated;
grant execute on function map_asset_detail(uuid, text) to authenticated;
grant execute on function site_local_xy(uuid, double precision, double precision) to authenticated;
