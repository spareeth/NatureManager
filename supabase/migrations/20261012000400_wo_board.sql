-- Task 2.4: manager views of work orders (FR-WO-06, 08, 09, 11). Security invoker: RLS applies.

-- SLA hours per priority (FR-WO-11), from organisation.settings.sla_hours, else the SRS defaults.
-- "Response" is work started: SLA is met when the job reaches in_progress within the hours after
-- it was raised; it is breached when that time has passed and work has not started.
create function org_sla_hours(p_org uuid, p_priority text) returns int
language sql stable set search_path = public as $$
  select coalesce((select (settings -> 'sla_hours' ->> p_priority)::int from organisation where id = p_org),
                  case p_priority when 'P1' then 4 when 'P2' then 24 when 'P3' then 72 else 336 end)
$$;

-- Work orders of a site for the inbox, board, calendar and map. p_from / p_to filter on the
-- planned start (calendar); p_status filters statuses (board, inbox); open = not closed/cancelled.
create function wo_board(p_site uuid, p_status wo_status[] default null, p_from timestamptz default null,
                         p_to timestamptz default null, p_open_only boolean default false, p_limit int default 2000)
returns jsonb language sql stable set search_path = public, extensions as $$
  with w as (
    select wo.*,
           wo.created_at + make_interval(hours => org_sla_hours(wo.organisation_id, wo.priority)) as sla_due,
           (select min(e.at) from work_order_event e where e.work_order_id = wo.id and e.to_status = 'in_progress') as started_at
    from work_order wo
    where wo.site_id = p_site
      and (p_status is null or wo.status = any(p_status))
      and (not p_open_only or wo.status not in ('closed', 'cancelled'))
      and (p_from is null or wo.planned_start >= p_from)
      and (p_to is null or wo.planned_start < p_to)
    order by wo.planned_start nulls first, wo.priority, wo.number
    limit greatest(least(p_limit, 5000), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status, 'priority', w.priority,
    'wo_type', w.wo_type, 'source', w.source, 'planned_start', w.planned_start, 'planned_end', w.planned_end,
    'due_at', w.due_at, 'created_at', w.created_at,
    'assignee_user_id', w.assignee_user_id, 'assignee_name', m.display_name,
    'team_id', w.team_id, 'team_name', t.name, 'location_code', l.code,
    'lon', round(st_x(w.geom)::numeric, 7), 'lat', round(st_y(w.geom)::numeric, 7),
    'sla_due', w.sla_due,
    'sla_breached', w.started_at is null and w.status in ('requested', 'approved', 'scheduled') and now() > w.sla_due,
    'sla_met', w.started_at is not null and w.started_at <= w.sla_due,
    'overdue', w.due_at is not null and now() > w.due_at and w.status not in ('completed', 'verified', 'closed', 'cancelled')
  ) order by w.planned_start nulls first, w.priority, w.number), '[]'::jsonb)
  from w
  left join membership m on m.user_id = w.assignee_user_id and m.organisation_id = w.organisation_id
  left join team t on t.id = w.team_id
  left join location l on l.id = w.location_id
$$;

-- One work order with its assets, events and SOP for the work order page.
create function wo_detail(p_wo uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', w.id, 'number', w.number, 'title', w.title, 'description', w.description, 'status', w.status,
    'priority', w.priority, 'wo_type', w.wo_type, 'source', w.source, 'site_id', w.site_id,
    'planned_start', w.planned_start, 'planned_end', w.planned_end, 'due_at', w.due_at,
    'est_minutes', w.est_minutes, 'actual_minutes', w.actual_minutes, 'materials', w.materials,
    'completion_notes', w.completion_notes, 'created_at', w.created_at,
    'created_by_name', (select display_name from membership where user_id = w.created_by and organisation_id = w.organisation_id),
    'assignee_user_id', w.assignee_user_id,
    'assignee_name', (select display_name from membership where user_id = w.assignee_user_id and organisation_id = w.organisation_id),
    'team_id', w.team_id, 'team_name', (select name from team where id = w.team_id),
    'location', (select jsonb_build_object('id', l.id, 'code', l.code) from location l where l.id = w.location_id),
    'sop', (select jsonb_build_object('id', s.id, 'code', s.code, 'version', s.version, 'title', s.title) from sop s where s.id = w.sop_id),
    'template_code', (select code from wo_template where id = w.template_id),
    'lon', round(st_x(w.geom)::numeric, 7), 'lat', round(st_y(w.geom)::numeric, 7),
    'sla_due', w.created_at + make_interval(hours => org_sla_hours(w.organisation_id, w.priority)),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'tag_code', a.tag_code) order by a.tag_code)
                        from work_order_asset wa join asset a on a.id = wa.asset_id where wa.work_order_id = w.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'from', e.from_status, 'to', e.to_status, 'note', e.note,
                                                            'source', e.source, 'by', m.display_name) order by e.at desc)
                        from work_order_event e left join membership m on m.user_id = e.actor and m.organisation_id = e.organisation_id
                        where e.work_order_id = w.id), '[]'::jsonb))
  from work_order w where w.id = p_wo
$$;

-- Schedule a request or approved job: set who and when, approve if needed, then move to scheduled
-- through wo_transition (so the transition rules and events apply).
create function wo_schedule(p_wo uuid, p_assignee uuid, p_team uuid, p_start timestamptz,
                            p_minutes int default null, p_note text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  w work_order;
  mins int;
begin
  select * into w from work_order where id = p_wo;
  if not found then
    raise exception 'work order % not found', p_wo using errcode = 'P0002';
  end if;
  mins := coalesce(p_minutes, w.est_minutes, 60);
  update work_order
     set assignee_user_id = p_assignee, team_id = p_team, planned_start = p_start,
         planned_end = p_start + make_interval(mins => mins),
         due_at = coalesce(due_at, (((p_start at time zone 'Asia/Dubai')::date + 1)::timestamp at time zone 'Asia/Dubai') - interval '1 second'),
         est_minutes = coalesce(p_minutes, est_minutes)
   where id = p_wo;
  if not found then
    raise exception 'not allowed to plan this work order' using errcode = '42501';
  end if;
  if w.status = 'requested' then
    perform wo_transition(p_wo, 'approved', p_note);
  end if;
  return wo_transition(p_wo, 'scheduled', p_note);
end
$$;

-- Re-plan (FR-WO-09): move start, keeping the duration; optionally change who does it.
create function wo_replan(p_wo uuid, p_start timestamptz, p_assignee uuid default null, p_team uuid default null,
                          p_keep_assignment boolean default true)
returns void language plpgsql set search_path = public as $$
begin
  update work_order
     set planned_end = p_start + coalesce(planned_end - planned_start, make_interval(mins => coalesce(est_minutes, 60))),
         planned_start = p_start,
         due_at = case when due_at is null or due_at < p_start
                       then (((p_start at time zone 'Asia/Dubai')::date + 1)::timestamp at time zone 'Asia/Dubai') - interval '1 second'
                       else due_at end,
         assignee_user_id = case when p_keep_assignment then assignee_user_id else p_assignee end,
         team_id = case when p_keep_assignment then team_id else p_team end
   where id = p_wo and status in ('requested', 'approved', 'scheduled', 'on_hold');
  if not found then
    raise exception 'work order % cannot be re-planned (not found, not allowed, or already started)', p_wo using errcode = '42501';
  end if;
end
$$;

-- Bulk move a day's open work to another day (FR-WO-09, for example weather), keeping the time of day.
create function wo_bulk_move(p_site uuid, p_from date, p_to date)
returns int language plpgsql set search_path = public as $$
declare n int;
begin
  update work_order
     set planned_start = planned_start + (p_to - p_from) * interval '1 day',
         planned_end = planned_end + (p_to - p_from) * interval '1 day',
         due_at = case when due_at is not null then due_at + (p_to - p_from) * interval '1 day' end
   where site_id = p_site and status in ('approved', 'scheduled', 'on_hold')
     and (planned_start at time zone 'Asia/Dubai')::date = p_from;
  get diagnostics n = row_count;
  return n;
end
$$;

-- Planning options: active members with their team, and teams.
create function wo_people(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.display_name, 'roles', m.roles,
                                                             'team_id', m.team_id) order by m.display_name)
                         from membership m where m.organisation_id = p_org and m.active), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'discipline', t.discipline) order by t.name)
                       from team t where t.organisation_id = p_org), '[]'::jsonb))
$$;

revoke execute on function org_sla_hours(uuid, text) from public, anon;
revoke execute on function wo_board(uuid, wo_status[], timestamptz, timestamptz, boolean, int) from public, anon;
revoke execute on function wo_detail(uuid) from public, anon;
revoke execute on function wo_schedule(uuid, uuid, uuid, timestamptz, int, text) from public, anon;
revoke execute on function wo_replan(uuid, timestamptz, uuid, uuid, boolean) from public, anon;
revoke execute on function wo_bulk_move(uuid, date, date) from public, anon;
revoke execute on function wo_people(uuid) from public, anon;
grant execute on function org_sla_hours(uuid, text) to authenticated;
grant execute on function wo_board(uuid, wo_status[], timestamptz, timestamptz, boolean, int) to authenticated;
grant execute on function wo_detail(uuid) to authenticated;
grant execute on function wo_schedule(uuid, uuid, uuid, timestamptz, int, text) to authenticated;
grant execute on function wo_replan(uuid, timestamptz, uuid, uuid, boolean) to authenticated;
grant execute on function wo_bulk_move(uuid, date, date) to authenticated;
grant execute on function wo_people(uuid) to authenticated;
