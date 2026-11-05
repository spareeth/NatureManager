-- Task 3.6: sensitive taxa (FR-OBS-06, NFR-11). For a taxon that is sensitive, protected or IUCN CR, EN
-- or VU (org_taxon), only curators and managers see where its plants and sightings are; everyone else
-- gets a point inside the bed or zone (or, with no place, the point rounded to about 100 m) and no site
-- grid coordinates. Enforced in the database: signed-in users cannot read the position columns
-- directly; positions come through asset_geom / observation_geom and the functions that use them.

create function taxon_is_sensitive(p_org uuid, p_taxon uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ot.sensitive or ot.iucn_category in ('CR', 'EN', 'VU') or ot.protection_level is not null
                     from org_taxon ot where ot.organisation_id = p_org and ot.taxon_id = p_taxon), false)
$$;

create function sees_exact_location(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select has_any_role(p_org, array['curator', 'manager'])
$$;

-- The point shown instead of an exact one.
create function obscured_point(p_geom extensions.geometry, p_location uuid) returns extensions.geometry
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select st_pointonsurface(l.geom) from location l where l.id = p_location),
    st_transform(st_snaptogrid(st_transform(st_centroid(p_geom), 3997), 100), 4326))
$$;

create function asset_hidden(p_asset uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a.taxon_id is not null and not sees_exact_location(a.organisation_id)
         and taxon_is_sensitive(a.organisation_id, a.taxon_id)
  from asset a where a.id = p_asset
$$;

-- The asset's position as the caller may see it (null outside the caller's organisations).
create function asset_geom(p_asset uuid) returns extensions.geometry
language sql stable security definer set search_path = public, extensions as $$
  select case when asset_hidden(a.id) then obscured_point(a.geom, a.location_id) else a.geom end
  from asset a where a.id = p_asset and a.organisation_id in (select auth_org_ids())
$$;

create function asset_local_xy(p_asset uuid, out x numeric, out y numeric)
language sql stable security definer set search_path = public as $$
  select case when asset_hidden(a.id) then null else a.local_x end,
         case when asset_hidden(a.id) then null else a.local_y end
  from asset a where a.id = p_asset and a.organisation_id in (select auth_org_ids())
$$;

create function observation_hidden(p_obs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select o.taxon_id is not null and not sees_exact_location(o.organisation_id)
         and taxon_is_sensitive(o.organisation_id, o.taxon_id)
  from observation o where o.id = p_obs
$$;

create function observation_geom(p_obs uuid) returns extensions.geometry
language sql stable security definer set search_path = public, extensions as $$
  select case when observation_hidden(o.id) then obscured_point(o.geom, o.location_id) else o.geom end
  from observation o where o.id = p_obs and o.organisation_id in (select auth_org_ids())
$$;

revoke execute on function taxon_is_sensitive(uuid, uuid), sees_exact_location(uuid),
  obscured_point(extensions.geometry, uuid), asset_hidden(uuid), asset_geom(uuid), asset_local_xy(uuid),
  observation_hidden(uuid), observation_geom(uuid) from public, anon;
grant execute on function taxon_is_sensitive(uuid, uuid), sees_exact_location(uuid),
  obscured_point(extensions.geometry, uuid), asset_hidden(uuid), asset_geom(uuid), asset_local_xy(uuid),
  observation_hidden(uuid), observation_geom(uuid) to authenticated;

-- No direct reads of the positions (writes stay as they were). anon keeps the other columns so that
-- RLS answers it with zero rows, as for every table.
revoke select on asset from authenticated, anon;
grant select (id, organisation_id, site_id, location_id, asset_type_id, tag_code, barcode, name,
              position_source, position_accuracy_m, status, condition, criticality, install_date, taxon_id,
              accession_id, parent_asset_id, plant_count, attributes, legacy_hortis_id, created_at, created_by,
              updated_at, qr_code) on asset to authenticated, anon;
revoke select on observation from authenticated, anon;
grant select (id, organisation_id, site_id, location_id, obs_type, observed_at, gps_accuracy_m, observer,
              asset_id, taxon_id, count, life_stage, behaviour, phenophase, severity, measurements,
              verification, verified_by, verified_at, notes, client_uuid, created_at, updated_at)
  on observation to authenticated, anon;

-- Functions read positions through asset_geom and asset_local_xy (as the caller may see them).
CREATE OR REPLACE FUNCTION public.map_assets(p_site uuid, p_west double precision, p_south double precision, p_east double precision, p_north double precision, p_limit integer DEFAULT 20000)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with box as (select st_makeenvelope(p_west, p_south, p_east, p_north, 4326) as g),
  lim as (select greatest(least(p_limit, 50000), 0) as n),
  hits as (
    select a.tag_code, a.status, t.asset_class,
           case when geometrytype(asset_geom(a.id)) = 'POINT' then asset_geom(a.id) else st_pointonsurface(asset_geom(a.id)) end as pt
    from asset a
    join asset_type t on t.id = a.asset_type_id
    , box
    where a.site_id = p_site and asset_geom(a.id) && box.g and st_intersects(asset_geom(a.id), box.g)
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
$function$;
CREATE OR REPLACE FUNCTION public.map_asset_detail(p_site uuid, p_tag text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'id', a.id, 'tag_code', a.tag_code, 'name', a.name, 'status', a.status,
    'asset_class', t.asset_class, 'type_code', t.code, 'type_name', t.name,
    'scientific_name', tx.scientific_name, 'location_code', l.code,
    'local_x', (asset_local_xy(a.id)).x, 'local_y', (asset_local_xy(a.id)).y,
    'position_hidden', coalesce(asset_hidden(a.id), false), 'position_source', a.position_source,
    'condition', a.condition)
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join location l on l.id = a.location_id
  where a.site_id = p_site and a.tag_code = p_tag
$function$;
CREATE OR REPLACE FUNCTION public.asset_detail(p_asset uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'id', a.id, 'site_id', a.site_id, 'tag_code', a.tag_code, 'barcode', a.barcode, 'name', a.name,
    'status', a.status, 'condition', a.condition, 'criticality', a.criticality,
    'install_date', a.install_date, 'plant_count', a.plant_count, 'attributes', a.attributes,
    'legacy_hortis_id', a.legacy_hortis_id,
    'geometry', st_asgeojson(asset_geom(a.id), 7)::jsonb,
    'lon', round(st_x(case when geometrytype(asset_geom(a.id)) = 'POINT' then asset_geom(a.id) else st_pointonsurface(asset_geom(a.id)) end)::numeric, 7),
    'lat', round(st_y(case when geometrytype(asset_geom(a.id)) = 'POINT' then asset_geom(a.id) else st_pointonsurface(asset_geom(a.id)) end)::numeric, 7),
    'local_x', (asset_local_xy(a.id)).x, 'local_y', (asset_local_xy(a.id)).y,
    'position_hidden', coalesce(asset_hidden(a.id), false),
    'position_source', a.position_source, 'position_accuracy_m', a.position_accuracy_m,
    'created_at', a.created_at, 'updated_at', a.updated_at,
    'type', jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'asset_class', t.asset_class,
                               'attribute_schema', t.attribute_schema),
    'taxon', case when tx.id is null then null else jsonb_build_object(
               'id', tx.id, 'scientific_name', tx.scientific_name, 'authorship', tx.authorship,
               'family', tx.family, 'common_names', tx.common_names,
               'inhouse_code', ot.inhouse_code, 'iucn_category', ot.iucn_category,
               'origin', ot.origin, 'sensitive', coalesce(ot.sensitive, false)) end,
    'accession', case when ac.id is null then null else jsonb_build_object(
               'id', ac.id, 'accession_number', ac.accession_number, 'received_date', ac.received_date,
               'source', ac.source, 'provenance_type', ac.provenance_type) end,
    'location', case when l.id is null then null else jsonb_build_object(
               'id', l.id, 'code', l.code, 'name', l.name, 'kind', l.kind,
               'zone_code', z.code, 'zone_name', z.name) end,
    'parent', case when p.id is null then null else jsonb_build_object('id', p.id, 'tag_code', p.tag_code) end,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'tag_code', c.tag_code) order by c.tag_code)
                          from asset c where c.parent_asset_id = a.id), '[]'::jsonb))
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
  left join accession ac on ac.id = a.accession_id
  left join location l on l.id = a.location_id
  left join location z on z.id = coalesce(l.parent_id, l.id)
  left join asset p on p.id = a.parent_asset_id
  where a.id = p_asset
$function$;
CREATE OR REPLACE FUNCTION public.asset_search(p_site uuid, p_q text DEFAULT NULL::text, p_class asset_class DEFAULT NULL::asset_class, p_type text DEFAULT NULL::text, p_status asset_status[] DEFAULT NULL::asset_status[], p_location text DEFAULT NULL::text, p_sort text DEFAULT 'tag_code'::text, p_desc boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with recursive loc as (
    select id from location where site_id = p_site and code = p_location
    union all
    select l.id from location l join loc on l.parent_id = loc.id
  ),
  q as (select nullif(trim(p_q), '') as s),
  hits as (
    select a.id, a.tag_code, a.barcode, a.name, a.status, a.condition, a.criticality, a.install_date,
           (asset_local_xy(a.id)).x, (asset_local_xy(a.id)).y, a.updated_at,
           t.code as type_code, t.name as type_name, t.asset_class,
           tx.scientific_name, ot.inhouse_code,
           l.code as location_code, z.code as zone_code
    from asset a
    join asset_type t on t.id = a.asset_type_id
    left join taxon tx on tx.id = a.taxon_id
    left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
    left join location l on l.id = a.location_id
    left join location z on z.id = coalesce(l.parent_id, l.id)
    , q
    where a.site_id = p_site
      and (p_class is null or t.asset_class = p_class)
      and (p_type is null or t.code = p_type)
      and (p_status is null or a.status = any(p_status))
      and (p_location is null or a.location_id in (select id from loc))
      and (q.s is null
           or a.tag_code ilike '%' || q.s || '%'
           or a.barcode ilike '%' || q.s || '%'
           or a.name ilike '%' || q.s || '%'
           or tx.scientific_name ilike '%' || q.s || '%'
           or tx.common_names::text ilike '%' || q.s || '%'
           or ot.inhouse_code ilike q.s)
  ),
  page as (
    select * from hits
    order by
      case when not p_desc then case p_sort
        when 'tag_code' then tag_code when 'scientific_name' then scientific_name
        when 'type' then type_name when 'location' then location_code when 'status' then status::text end end asc nulls last,
      case when p_desc then case p_sort
        when 'tag_code' then tag_code when 'scientific_name' then scientific_name
        when 'type' then type_name when 'location' then location_code when 'status' then status::text end end desc nulls last,
      case when not p_desc and p_sort = 'condition' then condition end asc nulls last,
      case when p_desc and p_sort = 'condition' then condition end desc nulls last,
      case when not p_desc and p_sort = 'updated_at' then updated_at end asc nulls last,
      case when p_desc and p_sort = 'updated_at' then updated_at end desc nulls last,
      tag_code
    limit greatest(least(p_limit, 500), 1) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'updated_at') from page), '[]'::jsonb))
$function$;
CREATE OR REPLACE FUNCTION public.field_scan(p_asset uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select jsonb_build_object(
    'id', a.id, 'organisation_id', a.organisation_id, 'site_id', a.site_id, 'tag_code', a.tag_code,
    'name', a.name, 'status', a.status, 'location_id', a.location_id,
    'location_code', (select code from location where id = a.location_id),
    'scientific_name', (select scientific_name from taxon where id = a.taxon_id),
    'lon', round(st_x(st_pointonsurface(asset_geom(a.id)))::numeric, 7), 'lat', round(st_y(st_pointonsurface(asset_geom(a.id)))::numeric, 7),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
                'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status, 'priority', w.priority,
                'planned_start', w.planned_start,
                'mine', wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id))
              order by w.planned_start nulls last, w.number)
              from work_order w join work_order_asset wa on wa.work_order_id = w.id
              where wa.asset_id = a.id and w.status in ('requested', 'approved', 'scheduled', 'in_progress', 'on_hold')),
            '[]'::jsonb))
  from asset a where a.id = p_asset
$function$;
CREATE OR REPLACE FUNCTION public.field_offline_pack(p_site uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  with days as (
    select d::date as day from generate_series(p_from, least(p_to, p_from + 6), interval '1 day') d
  ),
  day_lists as (
    select day, field_my_day(p_site, day) as list from days
  ),
  job_ids as (
    select distinct (j ->> 'id')::uuid as id from day_lists, jsonb_array_elements(list) j
  ),
  job_zones as (
    select distinct coalesce(case when l.kind = 'zone' then l.id end, l.parent_id) as zone_id
    from work_order w join job_ids j on j.id = w.id join location l on l.id = w.location_id
  ),
  zone_locations as (
    select l.id from location l join job_zones z on l.id = z.zone_id or l.parent_id = z.zone_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', coalesce((select jsonb_object_agg(day::text, list) from day_lists), '{}'::jsonb),
    'jobs', coalesce((select jsonb_agg(field_job(id)) from job_ids), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'organisation_id', a.organisation_id, 'site_id', a.site_id, 'tag_code', a.tag_code,
        'barcode', a.barcode, 'name', a.name, 'status', a.status, 'location_id', a.location_id,
        'location_code', l.code, 'scientific_name', t.scientific_name,
        'lon', round(st_x(st_pointonsurface(asset_geom(a.id)))::numeric, 7), 'lat', round(st_y(st_pointonsurface(asset_geom(a.id)))::numeric, 7))
        order by a.tag_code)
      from asset a join zone_locations z on z.id = a.location_id
      left join location l on l.id = a.location_id left join taxon t on t.id = a.taxon_id
      where a.site_id = p_site), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'name', i.name,
        'category', i.category, 'unit', i.unit) order by i.category, i.name)
      from item i where i.active and i.organisation_id = (select organisation_id from site where id = p_site)), '[]'::jsonb),
    'requests', field_requests(p_site),
    'bbox', (select jsonb_build_array(round(st_xmin(b)::numeric, 7), round(st_ymin(b)::numeric, 7),
                                      round(st_xmax(b)::numeric, 7), round(st_ymax(b)::numeric, 7))
             from (select st_envelope(boundary) b from site where id = p_site) s))
$function$;
CREATE OR REPLACE FUNCTION public.ai_collection_check(p_org uuid, p_taxa uuid[], p_location uuid DEFAULT NULL::uuid, p_lon double precision DEFAULT NULL::double precision, p_lat double precision DEFAULT NULL::double precision, p_radius_m numeric DEFAULT 25)
 RETURNS TABLE(taxon_id uuid, in_collection boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select t.id,
         exists (
           select 1 from asset a
           where a.organisation_id = p_org and a.taxon_id = t.id
             and a.status::text not in ('planned', 'dead', 'removed', 'disposed')
             and ((p_location is not null and a.location_id = p_location)
                  or (p_lon is not null and p_lat is not null
                      and st_dwithin(st_transform(asset_geom(a.id), 3997),
                                     st_transform(st_setsrid(st_makepoint(p_lon, p_lat), 4326), 3997),
                                     p_radius_m))))
  from unnest(p_taxa) as t(id)
$function$;
CREATE OR REPLACE FUNCTION public.asset_move_offset(p_asset uuid, p_dx double precision, p_dy double precision, p_accuracy numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  r record;
begin
  if asset_hidden(p_asset) then
    raise exception 'only curators and managers move a plant of a sensitive species' using errcode = '42501';
  end if;
  update asset a
     set geom = site_offset_geom(a.site_id, asset_geom(a.id), p_dx, p_dy),
         position_source = 'offset',
         position_accuracy_m = p_accuracy
   where a.id = p_asset
  returning a.id into r;
  if not found then
    raise exception 'asset % not found', p_asset using errcode = 'P0002';
  end if;
  return (select jsonb_build_object('id', r.id, 'local_x', xy.x, 'local_y', xy.y) from asset_local_xy(r.id) xy);
end
$function$;

-- Work order from an observation: at the point as the caller may see it (the bed for a sensitive species).
create or replace function wo_from_observation(
  p_obs uuid, p_title text default null, p_priority text default null, p_client_uuid uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  o observation;
  w uuid;
  v_title text;
begin
  -- Security definer (the observation's exact point is not readable by everyone): the caller must be
  -- a member of the observation's organisation, as the work_order insert policy asks.
  select * into o from observation where id = p_obs and organisation_id in (select auth_org_ids());
  if not found then
    raise exception 'observation not found' using errcode = 'P0002';
  end if;
  if o.verification = 'rejected' then
    raise exception 'a rejected observation does not raise work' using errcode = '22023';
  end if;
  if p_client_uuid is not null then
    select id into w from work_order where client_uuid = p_client_uuid;
    if found then return w; end if;
  end if;
  select id into w from work_order
   where organisation_id = o.organisation_id and source = 'observation' and source_ref = o.id
     and status not in ('closed', 'cancelled')
   limit 1;
  if found then return w; end if;

  v_title := nullif(btrim(p_title), '');
  if v_title is null then
    v_title := case o.obs_type
                 when 'pest_disease' then 'Pest or disease' when 'plant_health' then 'Plant health'
                 when 'flora' then 'Plant' when 'fauna' then 'Animal' when 'phenology' then 'Phenology'
                 when 'water_quality' then 'Water quality' else 'Observation' end
               || coalesce(': ' || (select scientific_name from taxon where id = o.taxon_id), '')
               || coalesce(' in ' || (select code from location where id = o.location_id), '');
  end if;

  insert into work_order (organisation_id, number, site_id, location_id, source, source_ref, wo_type,
                          title, description, priority, status, geom, client_uuid)
  values (o.organisation_id, '', o.site_id, o.location_id, 'observation', o.id, 'reactive',
          v_title, o.notes,
          coalesce(p_priority, case when o.severity = 5 then 'P1' when o.severity = 4 then 'P2'
                                    when o.severity <= 2 then 'P4' else 'P3' end),
          'requested', observation_geom(o.id), p_client_uuid)
  returning id into w;

  if o.asset_id is not null then
    insert into work_order_asset (organisation_id, work_order_id, asset_id)
    values (o.organisation_id, w, o.asset_id);
  end if;
  -- The observation's photos and sound are also listed on the work order (one media row per file:
  -- the row keeps its observation and gains the work order).
  update media set work_order_id = w where observation_id = o.id and work_order_id is null;
  return w;
end
$$;
