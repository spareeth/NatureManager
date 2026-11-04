-- Requests in the field app (decision 3 Nov 2026): open requests of the site for everyone, and the
-- requests I raised with their status. Security invoker: RLS applies.

-- open: work requests not yet scheduled (requested or approved), oldest first, with their place.
-- mine: work orders I raised from the field (source request) and item requests I raised, open ones
--       and those closed in the last 30 days, newest first, with the latest note (for example a
--       rejection or cancellation reason).
create function field_requests(p_site uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status, 'priority', w.priority,
        'wo_type', w.wo_type, 'location_code', l.code, 'created_at', w.created_at,
        'created_by_name', (select display_name from membership where user_id = w.created_by and organisation_id = w.organisation_id),
        'mine', w.created_by = auth.uid(),
        'lon', round(st_x(w.geom)::numeric, 7), 'lat', round(st_y(w.geom)::numeric, 7))
        order by w.priority, w.created_at)
      from work_order w left join location l on l.id = w.location_id
      where w.site_id = p_site and w.status in ('requested', 'approved')), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
        select jsonb_build_object(
          'kind', 'work', 'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status,
          'wo_type', w.wo_type, 'location_code', l.code, 'created_at', w.created_at,
          'planned_start', w.planned_start,
          'note', (select e.note from work_order_event e where e.work_order_id = w.id order by e.at desc limit 1)) x
        from work_order w left join location l on l.id = w.location_id
        where w.site_id = p_site and w.created_by = auth.uid() and w.source = 'request'
          and (w.status not in ('closed', 'cancelled') or w.updated_at > now() - interval '30 days')
        union all
        select jsonb_build_object(
          'kind', 'items', 'id', r.id, 'number', r.number,
          'title', (select string_agg(li.quantity || ' ' || li.unit || ' ' || li.description, '; ' order by li.line_no)
                    from item_request_line li where li.item_request_id = r.id),
          'status', r.status, 'wo_type', null, 'location_code', l.code, 'created_at', r.created_at,
          'planned_start', null,
          'note', (select e.note from item_request_event e where e.item_request_id = r.id order by e.at desc limit 1))
        from item_request r left join location l on l.id = r.location_id
        where r.site_id = p_site and r.requested_by = auth.uid()
          and (r.status not in ('fulfilled', 'cancelled', 'rejected', 'rejected_by_receiver')
               or r.updated_at > now() - interval '30 days')) s), '[]'::jsonb))
$$;
revoke execute on function field_requests(uuid) from public, anon;
grant execute on function field_requests(uuid) to authenticated;

-- The offline pack also carries the requests lists.
create or replace function field_offline_pack(p_site uuid, p_from date, p_to date)
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
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'name', i.name,
        'category', i.category, 'unit', i.unit) order by i.category, i.name)
      from item i where i.active and i.organisation_id = (select organisation_id from site where id = p_site)), '[]'::jsonb),
    'requests', field_requests(p_site),
    'bbox', (select jsonb_build_array(round(st_xmin(b)::numeric, 7), round(st_ymin(b)::numeric, 7),
                                      round(st_xmax(b)::numeric, 7), round(st_ymax(b)::numeric, 7))
             from (select st_envelope(boundary) b from site where id = p_site) s))
$$;
