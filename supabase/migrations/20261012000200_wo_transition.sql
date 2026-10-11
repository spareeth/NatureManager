-- Task 2.2: wo_transition() (SRS 3.4.1, FR-WO-02, 03, 07, 10; CLAUDE.md rule 4).
--
-- Security definer: it is the only way to change work_order.status and to write
-- work_order_event, so it checks membership and roles itself instead of relying on RLS.

-- The SRS 3.4.1 table. 'assignee' means the assigned user or a member of the assigned team.
create table wo_transition_rule (
  from_status wo_status not null,
  to_status wo_status not null,
  roles text[] not null,               -- organisation roles allowed
  assignee_allowed boolean not null,   -- the assignee (or team member) may also do it
  note_required boolean not null default false,
  primary key (from_status, to_status)
);
insert into wo_transition_rule values
  ('requested',   'approved',    '{manager,field_manager}', false, false),
  ('requested',   'cancelled',   '{manager,field_manager}', false, false),
  ('approved',    'scheduled',   '{manager,field_manager}', false, false),
  ('scheduled',   'in_progress', '{field_manager}',         true,  false),
  ('in_progress', 'on_hold',     '{field_manager}',         true,  false),
  ('in_progress', 'completed',   '{field_manager}',         true,  false),
  ('on_hold',     'in_progress', '{field_manager}',         true,  false),
  ('completed',   'verified',    '{manager,field_manager}', false, false),
  ('completed',   'in_progress', '{manager,field_manager}', false, true),   -- verification failed, reason required
  ('verified',    'closed',      '{manager,field_manager}', false, false);
-- Reference data, the same for every organisation: readable, never written by clients.
alter table wo_transition_rule enable row level security;
create policy wo_transition_rule_read on wo_transition_rule for select to authenticated using (true);

-- Required SOP steps without an answer (a required photo step needs a photo). Used by the
-- completeness check and by the field app to show what is missing.
create function wo_missing_steps(p_wo uuid)
returns table (step_id uuid, seq int, text jsonb, input_type text)
language sql stable set search_path = public as $$
  select st.id, st.seq, st.text, st.input_type
  from work_order w
  join sop_step st on st.sop_id = w.sop_id
  left join sop_response r on r.work_order_id = w.id and r.sop_step_id = st.id
  where w.id = p_wo and st.required
    and (r.work_order_id is null
         or (st.input_type = 'photo' and r.media_id is null)
         or (st.input_type <> 'photo' and (r.value is null or r.value = 'null'::jsonb or r.value = '""'::jsonb
                                          or (st.input_type = 'tick' and r.value <> 'true'::jsonb))))
  order by st.seq
$$;

create function wo_transition(p_wo uuid, p_to wo_status, p_note text default null,
                              p_geom geometry default null, p_client_uuid uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  w work_order;
  r wo_transition_rule;
  ev work_order_event;
  me uuid := auth.uid();
  is_assignee boolean;
  missing int;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  -- Offline replay (CLAUDE.md rule 5): the same client_uuid returns the original result.
  if p_client_uuid is not null then
    select * into ev from work_order_event where client_uuid = p_client_uuid;
    if found then
      if ev.work_order_id <> p_wo or ev.to_status <> p_to then
        raise exception 'client_uuid % already used for another transition', p_client_uuid using errcode = '23505';
      end if;
      return jsonb_build_object('work_order_id', ev.work_order_id, 'event_id', ev.id,
                                'from', ev.from_status, 'to', ev.to_status, 'replayed', true);
    end if;
  end if;

  select * into w from work_order where id = p_wo for update;
  -- Same answer for "does not exist" and "not in your organisation": nothing to learn.
  if not found or w.organisation_id not in (select auth_org_ids()) then
    raise exception 'work order % not found', p_wo using errcode = 'P0002';
  end if;

  select * into r from wo_transition_rule where from_status = w.status and to_status = p_to;
  if not found then
    raise exception 'transition % -> % is not allowed', w.status, p_to using errcode = '22023';
  end if;

  is_assignee := wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id);
  if not (has_any_role(w.organisation_id, r.roles) or (r.assignee_allowed and is_assignee)) then
    raise exception 'your role may not move a work order from % to %', w.status, p_to using errcode = '42501';
  end if;

  if r.note_required and coalesce(trim(p_note), '') = '' then
    raise exception 'a reason is required for % -> %', w.status, p_to using errcode = '22023';
  end if;

  if p_to = 'scheduled' and w.assignee_user_id is null and w.team_id is null then
    raise exception 'assign a person or a team before scheduling' using errcode = '22023';
  end if;

  if p_to = 'completed' then
    select count(*) into missing from wo_missing_steps(p_wo);
    if missing > 0 then
      raise exception '% required SOP step(s) not answered', missing using errcode = '22023';
    end if;
  end if;

  -- No self-verification (FR-WO-10): not the assignee, not a team member, not whoever completed it.
  if p_to = 'verified' and (is_assignee or exists (
        select 1 from work_order_event e
        where e.work_order_id = p_wo and e.to_status = 'completed' and e.actor = me)) then
    raise exception 'you cannot verify a job you did yourself' using errcode = '42501';
  end if;

  perform set_config('app.wo_transition', 'on', true);
  update work_order set status = p_to where id = p_wo;
  perform set_config('app.wo_transition', '', true);

  insert into work_order_event (organisation_id, work_order_id, from_status, to_status, note, geom, actor, client_uuid)
  values (w.organisation_id, p_wo, w.status, p_to, nullif(trim(p_note), ''),
          case when p_geom is null then null else st_transform(st_setsrid(p_geom, coalesce(nullif(st_srid(p_geom), 0), 4326)), 4326) end,
          me, p_client_uuid)
  returning * into ev;

  return jsonb_build_object('work_order_id', p_wo, 'event_id', ev.id, 'number', w.number,
                            'from', w.status, 'to', p_to, 'replayed', false);
end
$$;

revoke execute on function wo_transition(uuid, wo_status, text, geometry, uuid) from public, anon;
grant execute on function wo_transition(uuid, wo_status, text, geometry, uuid) to authenticated;
revoke execute on function wo_missing_steps(uuid) from public, anon;
grant execute on function wo_missing_steps(uuid) to authenticated;

-- Which transitions the caller may make now on a work order (for the UI buttons). Same rules as
-- wo_transition, without the completeness and self-verification checks, which are reported there.
create function wo_allowed_transitions(p_wo uuid)
returns table (to_status wo_status, note_required boolean)
language sql stable set search_path = public as $$
  select r.to_status, r.note_required
  from work_order w
  join wo_transition_rule r on r.from_status = w.status
  where w.id = p_wo
    and (has_any_role(w.organisation_id, r.roles)
         or (r.assignee_allowed and wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id)))
  order by r.to_status
$$;
revoke execute on function wo_allowed_transitions(uuid) from public, anon;
grant execute on function wo_allowed_transitions(uuid) to authenticated;
