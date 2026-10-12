-- Task 2.6: field app (FR-FLD-01, 03, 06). Security invoker: RLS applies.

-- SOP answers belong to the job's pinned SOP version and are given while the job is in progress
-- (FR-FLD-03). Applies to signed-in users; system work without a user (seed, simulation) is not limited.
create function sop_response_guard() returns trigger
language plpgsql set search_path = public as $$
declare w work_order;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select * into w from work_order
   where id = case when tg_op = 'DELETE' then old.work_order_id else new.work_order_id end;
  if w.status <> 'in_progress' then
    raise exception 'SOP steps are answered while the job is in progress (it is %)', w.status using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from sop_step where id = new.sop_step_id and sop_id = w.sop_id) then
      raise exception 'step is not part of the SOP version of this job' using errcode = '22023';
    end if;
    new.answered_by := auth.uid();
    new.answered_at := now();
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger sop_response_guard before insert or update or delete on sop_response
  for each row execute function sop_response_guard();

-- "My day" (FR-FLD-01): jobs assigned to me or my team that are planned for the day, plus my
-- unfinished jobs from earlier days (scheduled, in progress or on hold). Sorted by location.
create function field_my_day(p_site uuid, p_day date)
returns jsonb language sql stable set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id, 'number', w.number, 'title', w.title, 'status', w.status, 'priority', w.priority,
    'wo_type', w.wo_type, 'planned_start', w.planned_start, 'due_at', w.due_at,
    'location_code', l.code, 'est_minutes', w.est_minutes,
    'mine', w.assignee_user_id = auth.uid(),
    'lon', round(st_x(w.geom)::numeric, 7), 'lat', round(st_y(w.geom)::numeric, 7),
    'steps', (select count(*) from sop_step where sop_id = w.sop_id),
    'answered', (select count(*) from sop_response r where r.work_order_id = w.id),
    'overdue', w.due_at is not null and now() > w.due_at
  ) order by l.code nulls last, w.planned_start, w.number), '[]'::jsonb)
  from work_order w
  left join location l on l.id = w.location_id
  where w.site_id = p_site
    and wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id)
    and (
      (w.status in ('scheduled', 'in_progress', 'on_hold', 'completed')
       and (w.planned_start at time zone 'Asia/Dubai')::date = p_day)
      or (w.status in ('scheduled', 'in_progress', 'on_hold')
          and (w.planned_start at time zone 'Asia/Dubai')::date < p_day)
    )
$$;

-- One job for the phone: the work order, its pinned SOP with steps and my answers, and photos.
create function field_job(p_wo uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select wo_detail(w.id) || jsonb_build_object(
    'mine', wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id),
    'organisation_id', w.organisation_id,
    'sop', (select jsonb_build_object('id', s.id, 'code', s.code, 'version', s.version, 'title', s.title,
                                      'ppe', s.ppe, 'hazards', s.hazards)
            from sop s where s.id = w.sop_id),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
                'id', st.id, 'seq', st.seq, 'text', st.text, 'input_type', st.input_type, 'choices', st.choices,
                'unit', st.unit, 'required', st.required, 'media_path', st.media_path,
                'value', r.value, 'media_id', r.media_id,
                'media_path_answer', (select m.path from media m where m.id = r.media_id)) order by st.seq)
              from sop_step st left join sop_response r on r.work_order_id = w.id and r.sop_step_id = st.id
              where st.sop_id = w.sop_id), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(m.seq order by m.seq) from wo_missing_steps(w.id) m), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'caption', m.caption,
                                                            'taken_at', m.taken_at) order by m.created_at)
                        from media m where m.work_order_id = w.id and m.kind = 'photo'), '[]'::jsonb))
  from work_order w where w.id = p_wo
$$;

revoke execute on function field_my_day(uuid, date) from public, anon;
revoke execute on function field_job(uuid) from public, anon;
grant execute on function field_my_day(uuid, date) to authenticated;
grant execute on function field_job(uuid) to authenticated;
