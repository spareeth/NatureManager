-- Task 2.9: the verification queue, pass and fail with a reason (FR-WO-10).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;

create temp table tg as select s.id site, s.organisation_id org,
  (select id from team t where t.organisation_id = s.organisation_id and t.name = 'Green Team East') east
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- Two jobs for green1, started and completed by green1.
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, assignee_user_id, team_id)
select v.id::uuid, org, site, 'manual', 'preventive', v.title, 'scheduled', '10000000-0000-0000-0000-000000000005', east
from tg, (values ('93000000-0000-0000-0000-0000000000a1', 'Bed care NG-01'), ('93000000-0000-0000-0000-0000000000a2', 'Bed care NG-02')) v(id, title);
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select wo_transition(id, 'in_progress', null) from work_order;
select wo_transition(id, 'completed', 'done') from work_order;
select is((select jsonb_array_length(wo_verify_queue(site)) from tg), 2, 'completed jobs are in the queue');
select is((select bool_or((j ->> 'can_verify')::boolean) from tg, jsonb_array_elements(wo_verify_queue(site)) j), false,
  'the person who did the job cannot verify it');
select is((select wo_verify_queue(site) -> 0 ->> 'completed_by_name' from tg), 'Green One', 'shows who completed it');

-- The field manager verifies one and fails the other with a reason.
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select bool_and((j ->> 'can_verify')::boolean) from tg, jsonb_array_elements(wo_verify_queue(site)) j), true,
  'the field manager can verify');
select lives_ok($$select wo_transition('93000000-0000-0000-0000-0000000000a1', 'verified', 'Checklist: SOP followed; photos show result; site left clean')$$,
  'pass: verified');
select throws_ok($$select wo_transition('93000000-0000-0000-0000-0000000000a2', 'in_progress', null)$$, '22023', null,
  'fail needs a reason');
select lives_ok($$select wo_transition('93000000-0000-0000-0000-0000000000a2', 'in_progress', 'Mulch missing on the north edge')$$,
  'fail with a reason returns the job to in progress');
select is((select jsonb_array_length(wo_verify_queue(site)) from tg), 0, 'the queue is empty');
select is((select note from work_order_event where work_order_id = '93000000-0000-0000-0000-0000000000a2' and from_status = 'completed'),
  'Mulch missing on the north edge', 'the reason is in the history');
select * from finish();
rollback;
