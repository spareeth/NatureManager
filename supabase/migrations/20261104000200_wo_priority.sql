-- Planners change a work order's priority (decision 4 Nov 2026). Only managers and field managers may
-- change it after the request is raised; the change and its reason are kept in the job's history as a
-- work_order_event with the same from and to status (source 'user', note "Priority P3 to P1: reason").

create function wo_priority_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.priority is distinct from old.priority and auth.uid() is not null
     and coalesce(current_setting('app.wo_priority', true), '') <> 'on' then
    raise exception 'priority changes only through wo_set_priority()' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger wo_priority_guard before update of priority on work_order
  for each row execute function wo_priority_guard();

-- Security definer like wo_transition: it checks the role itself and writes the event, which clients
-- cannot insert directly.
create function wo_set_priority(p_wo uuid, p_priority text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w work_order;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into w from work_order where id = p_wo for update;
  if not found or w.organisation_id not in (select auth_org_ids()) then
    raise exception 'work order % not found', p_wo using errcode = 'P0002';
  end if;
  if not has_any_role(w.organisation_id, array['manager', 'field_manager']) then
    raise exception 'only managers and field managers change priority' using errcode = '42501';
  end if;
  if p_priority not in ('P1', 'P2', 'P3', 'P4') then
    raise exception 'priority must be P1, P2, P3 or P4' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required to change priority' using errcode = '22023';
  end if;
  if w.status in ('closed', 'cancelled') then
    raise exception 'a % work order cannot change priority', w.status using errcode = '22023';
  end if;
  if w.priority = p_priority then
    return jsonb_build_object('work_order_id', p_wo, 'priority', p_priority, 'changed', false);
  end if;
  perform set_config('app.wo_priority', 'on', true);
  update work_order set priority = p_priority where id = p_wo;
  perform set_config('app.wo_priority', '', true);
  insert into work_order_event (organisation_id, work_order_id, from_status, to_status, note, actor)
  values (w.organisation_id, p_wo, w.status, w.status,
          'Priority ' || w.priority || ' to ' || p_priority || ': ' || trim(p_reason), me);
  return jsonb_build_object('work_order_id', p_wo, 'priority', p_priority, 'changed', true);
end
$$;
revoke execute on function wo_set_priority(uuid, text, text) from public, anon;
grant execute on function wo_set_priority(uuid, text, text) to authenticated;
