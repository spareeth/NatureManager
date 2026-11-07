-- Task 2.2: wo_transition. Every allowed and forbidden transition for six people, then the
-- completeness, self-verification, reason, scheduling, replay and isolation rules.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create temp table tg as
  select s.id site, s.organisation_id org, (select id from team where name = 'Green Team East') east
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated, anon;

-- SOP with one required tick step, one required photo step; a work order for green1 (Green Team East).
insert into sop (id, organisation_id, code, title, status, approved_at)
select 'e0000000-0000-0000-0000-0000000000c1', org, 'SOP-T', '{"en": "Test"}', 'approved', now() from tg;
insert into sop_step (id, organisation_id, sop_id, seq, text, input_type, required)
select v.id::uuid, org, 'e0000000-0000-0000-0000-0000000000c1', v.seq, v.t::jsonb, v.kind, true from tg,
  (values ('e0000000-0000-0000-0000-0000000000c2', 1, '{"en": "Weed"}', 'tick'),
          ('e0000000-0000-0000-0000-0000000000c3', 2, '{"en": "Photo after"}', 'photo')) v(id, seq, t, kind);
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, assignee_user_id, sop_id)
select 'e0000000-0000-0000-0000-00000000a001', org, site, 'manual', 'preventive', 'Matrix job', 'scheduled',
       '10000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-0000000000c1' from tg;
-- Answer both steps so completion is never blocked during the matrix.
insert into media (id, organisation_id, bucket, path, kind, work_order_id)
select 'e0000000-0000-0000-0000-0000000000d1', org, 'photos', org || '/wo/after.jpg', 'photo', 'e0000000-0000-0000-0000-00000000a001' from tg;
insert into sop_response (organisation_id, work_order_id, sop_step_id, value, media_id)
select org, 'e0000000-0000-0000-0000-00000000a001', v.step::uuid, v.val::jsonb, v.media::uuid from tg,
  (values ('e0000000-0000-0000-0000-0000000000c2', 'true', null), ('e0000000-0000-0000-0000-0000000000c3', null, 'e0000000-0000-0000-0000-0000000000d1')) v(step, val, media);

create temp table actors (name text primary key, uid uuid);
insert into actors values ('manager', '10000000-0000-0000-0000-000000000002'), ('field_manager', '10000000-0000-0000-0000-000000000003'),
  ('assignee', '10000000-0000-0000-0000-000000000005'), ('other_green', '10000000-0000-0000-0000-000000000006'),
  ('curator', '10000000-0000-0000-0000-000000000004'), ('owner', '10000000-0000-0000-0000-000000000001');
create temp table outcome (from_s text, to_s text, actor text, ok boolean, code text);

-- One attempt: put the job in p_from, then try p_to as the actor. A success is rolled back with a
-- deliberate exception so the next attempt starts clean; the outcome is recorded afterwards.
create function pg_temp.try(p_from wo_status, p_to wo_status, p_actor text, p_uid uuid) returns void language plpgsql as $$
declare ok boolean := false; code text;
begin
  perform set_config('app.wo_transition', 'on', true);
  update work_order set status = p_from where id = 'e0000000-0000-0000-0000-00000000a001';
  perform set_config('app.wo_transition', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    perform wo_transition('e0000000-0000-0000-0000-00000000a001', p_to, 'reason given');
    ok := true;
    raise exception 'undo' using errcode = 'P0001';
  exception when others then
    code := case when sqlstate = 'P0001' then null else sqlstate end;
  end;
  reset role;
  insert into outcome values (p_from, p_to, p_actor, ok, code);
end $$;

select pg_temp.try(f, t, a.name, a.uid)
from unnest(enum_range(null::wo_status)) f, unnest(enum_range(null::wo_status)) t, actors a;

select is((select count(*)::int from outcome), 486, 'tried every from x to x actor (9 x 9 x 6)');

-- SRS 3.4.1, written out independently of wo_transition_rule.
create temp table expected (from_s text, to_s text, actor text);
insert into expected
select f, t, a from (values
  ('requested', 'approved', '{manager,field_manager}'), ('requested', 'cancelled', '{manager,field_manager}'),
  ('approved', 'scheduled', '{manager,field_manager}'),
  ('scheduled', 'in_progress', '{assignee,field_manager}'),
  ('in_progress', 'on_hold', '{assignee,field_manager}'), ('in_progress', 'completed', '{assignee,field_manager}'),
  ('on_hold', 'in_progress', '{assignee,field_manager}'),
  ('completed', 'verified', '{manager,field_manager}'), ('completed', 'in_progress', '{manager,field_manager}'),
  ('verified', 'closed', '{manager,field_manager}')) v(f, t, roles), unnest(roles::text[]) a;

select results_eq($$select from_s, to_s, actor from outcome where ok order by 1, 2, 3$$,
                  $$select from_s, to_s, actor from expected order by 1, 2, 3$$,
  'exactly the SRS 3.4.1 transitions succeed, for exactly the listed people');
select is((select count(*)::int from outcome where not ok and code is null), 0, 'every refusal comes with an error code');
select is((select array_agg(distinct code order by code) from outcome o where not ok
           and not exists (select 1 from wo_transition_rule r where r.from_status::text = o.from_s and r.to_status::text = o.to_s)),
  '{22023}', 'transitions outside the table are refused as invalid (22023)');
select is((select array_agg(distinct code order by code) from outcome o where not ok
           and exists (select 1 from wo_transition_rule r where r.from_status::text = o.from_s and r.to_status::text = o.to_s)),
  '{42501}', 'listed transitions by the wrong person are refused as not permitted (42501)');

-- Specific rules ---------------------------------------------------------------------------
create function pg_temp.set_status(s wo_status) returns void language sql as $$
  select set_config('app.wo_transition', 'on', true);
  update work_order set status = s where id = 'e0000000-0000-0000-0000-00000000a001';
  select set_config('app.wo_transition', '', true); $$;
create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- Completeness: unanswered tick, then photo without media.
select pg_temp.set_status('in_progress');
update sop_response set value = 'false' where sop_step_id = 'e0000000-0000-0000-0000-0000000000c2';
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select results_eq($$select seq, input_type from wo_missing_steps('e0000000-0000-0000-0000-00000000a001')$$,
  $$values (1, 'tick'::text)$$, 'an unticked required step is reported missing');
select throws_like($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'completed')$$,
  '1 required SOP step(s) not answered', 'completion blocked while a required step is missing');
reset role;
update sop_response set value = 'true' where sop_step_id = 'e0000000-0000-0000-0000-0000000000c2';
update sop_response set media_id = null where sop_step_id = 'e0000000-0000-0000-0000-0000000000c3';
set local role authenticated;
select throws_like($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'completed')$$,
  '%required SOP step%', 'a required photo step needs a photo');
reset role;
update sop_response set media_id = 'e0000000-0000-0000-0000-0000000000d1' where sop_step_id = 'e0000000-0000-0000-0000-0000000000c3';

-- The field manager completes the job; then cannot verify it (self-verification).
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select lives_ok($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'completed', 'done', st_setsrid(st_makepoint(55.1544, 24.9587), 4326))$$,
  'field manager completes with GPS');
select throws_like($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'verified')$$,
  '%cannot verify a job you did yourself%', 'whoever completed the job cannot verify it');
-- Failed verification needs a reason.
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
select throws_like($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'in_progress', '  ')$$,
  '%reason is required%', 'a failed verification needs a reason');
select lives_ok($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'in_progress', 'Mulch missing on the north side')$$,
  'manager fails verification with a reason');
reset role;
select results_eq(
  $$select from_status::text, to_status::text, note, actor, round(st_x(geom)::numeric, 4)
    from work_order_event where work_order_id = 'e0000000-0000-0000-0000-00000000a001' order by at, to_status$$,
  $$values ('in_progress'::text, 'completed'::text, 'done'::text, '10000000-0000-0000-0000-000000000003'::uuid, 55.1544::numeric),
           ('completed', 'in_progress', 'Mulch missing on the north side', '10000000-0000-0000-0000-000000000002'::uuid, null)$$,
  'events record from, to, note, actor and GPS');

-- Offline replay with client_uuid.
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is((select wo_transition('e0000000-0000-0000-0000-00000000a001', 'on_hold', null, null, 'e0000000-0000-0000-0000-0000000000f1') ->> 'replayed'),
  'false', 'first call with a client_uuid applies');
select is((select wo_transition('e0000000-0000-0000-0000-00000000a001', 'on_hold', null, null, 'e0000000-0000-0000-0000-0000000000f1') ->> 'replayed'),
  'true', 'the same client_uuid again is a replay, not an error');
select throws_ok($$select wo_transition('e0000000-0000-0000-0000-00000000a001', 'in_progress', null, null, 'e0000000-0000-0000-0000-0000000000f1')$$,
  '23505', null, 'a client_uuid cannot be reused for a different transition');
reset role;
select is((select count(*)::int from work_order_event where client_uuid = 'e0000000-0000-0000-0000-0000000000f1'), 1, 'the replay wrote no second event');

-- Buttons for the assignee while on hold.
set local role authenticated;
select results_eq($$select to_status::text from wo_allowed_transitions('e0000000-0000-0000-0000-00000000a001')$$,
  $$values ('in_progress'::text)$$, 'allowed transitions for the assignee on hold: back to in progress');
reset role;

-- Scheduling needs someone assigned.
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status)
select 'e0000000-0000-0000-0000-00000000a002', org, site, 'request', 'reactive', 'Unassigned', 'approved' from tg;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_like($$select wo_transition('e0000000-0000-0000-0000-00000000a002', 'scheduled')$$,
  '%assign a person or a team%', 'cannot schedule unassigned work');
reset role;

-- Status still cannot be changed directly.
select throws_ok($$update work_order set status = 'closed' where id = 'e0000000-0000-0000-0000-00000000a002'$$, '42501', null,
  'direct status update still refused');

-- Another organisation and anonymous callers.
insert into auth.users (id, email) values ('e0000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('eeeeeeee-2222-0000-0000-000000000000', 'Other', 'other-tr');
insert into membership (organisation_id, user_id, roles, display_name)
values ('eeeeeeee-2222-0000-0000-000000000000', 'e0000000-0000-0000-0000-00000000000b', '{manager,field_manager}', 'Other');
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000b');
set local role authenticated;
select throws_ok($$select wo_transition('e0000000-0000-0000-0000-00000000a002', 'cancelled')$$, 'P0002', null,
  'another organisation''s manager gets "not found"');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select wo_transition('e0000000-0000-0000-0000-00000000a002', 'cancelled')$$, '42501', null,
  'anonymous callers are refused');
reset role;

select * from finish();
rollback;
