-- Task 2.8: offline field app (FR-FLD-04, NFR-03). Security invoker: RLS applies.

-- Everything the phone keeps for a shift without network, in one call:
--   days:   My day for each date from p_from to p_to
--   jobs:   field_job() for each of my open jobs in those days (and unfinished earlier ones)
--   assets: assets in the zones of those jobs, for offline scanning (FR-FLD-04 "assets in assigned zones")
--   bbox:   site boundary extent, for the map tile cache
create function field_offline_pack(p_site uuid, p_from date, p_to date)
returns jsonb language sql stable set search_path = public, extensions as $$
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
    -- the zone of each job location (a bed's parent, or the zone itself)
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
        'lon', round(st_x(st_pointonsurface(a.geom))::numeric, 7), 'lat', round(st_y(st_pointonsurface(a.geom))::numeric, 7))
        order by a.tag_code)
      from asset a join zone_locations z on z.id = a.location_id
      left join location l on l.id = a.location_id left join taxon t on t.id = a.taxon_id
      where a.site_id = p_site), '[]'::jsonb),
    'bbox', (select jsonb_build_array(round(st_xmin(b)::numeric, 7), round(st_ymin(b)::numeric, 7),
                                      round(st_xmax(b)::numeric, 7), round(st_ymax(b)::numeric, 7))
             from (select st_envelope(boundary) b from site where id = p_site) s))
$$;

revoke execute on function field_offline_pack(uuid, date, date) from public, anon;
grant execute on function field_offline_pack(uuid, date, date) to authenticated;
