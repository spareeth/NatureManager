-- Task 3.5: work order from an observation (FR-OBS-05), in one tap on the phone or the review page.
-- Security invoker: the work_order insert policy applies (any member may raise a request, status
-- requested). The work order is reactive, source 'observation', source_ref the observation, at the
-- observation's point and place, linked to its asset, with the observation's photos and sound
-- (their media rows are linked to the work order too).
-- Idempotent: a replay with the same client uuid, or a second tap while a work order from the
-- observation is still open, returns that work order.

create function wo_from_observation(
  p_obs uuid, p_title text default null, p_priority text default null, p_client_uuid uuid default null)
returns uuid language plpgsql security invoker set search_path = public, extensions as $$
declare
  o observation;
  w uuid;
  v_title text;
begin
  select * into o from observation where id = p_obs;
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
          'requested', o.geom, p_client_uuid)
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
revoke execute on function wo_from_observation(uuid, text, text, uuid) from public, anon;
grant execute on function wo_from_observation(uuid, text, text, uuid) to authenticated;

-- The field app's "Mine" list also shows work raised from my observations.
create or replace function field_requests(p_site uuid)
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
        where w.site_id = p_site and w.created_by = auth.uid() and w.source in ('request', 'observation')
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

