-- Planners change priority with a reason, kept in the history; nobody else can change it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);
create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, priority, assignee_user_id)
select '99000000-0000-0000-0000-0000000000a1', org, site, 'request', 'reactive', 'Fallen branch on path', 'requested', 'P3',
       '10000000-0000-0000-0000-000000000005' from tg;

select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select throws_ok($$select wo_set_priority('99000000-0000-0000-0000-0000000000a1', 'P1', 'blocking the path')$$, '42501', null,
  'green team cannot change priority');
select throws_ok($$update work_order set priority = 'P1' where id = '99000000-0000-0000-0000-0000000000a1'$$, '42501', null,
  'and cannot change it directly either');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select throws_ok($$select wo_set_priority('99000000-0000-0000-0000-0000000000a1', 'P1', '')$$, '22023', null, 'a reason is required');
select throws_ok($$select wo_set_priority('99000000-0000-0000-0000-0000000000a1', 'P9', 'x')$$, '22023', null, 'only P1 to P4');
select is((select wo_set_priority('99000000-0000-0000-0000-0000000000a1', 'P1', 'Blocking the main path') ->> 'changed'), 'true',
  'field manager raises it to P1');
select is((select priority from work_order where id = '99000000-0000-0000-0000-0000000000a1'), 'P1', 'priority changed');
select is((select note from work_order_event where work_order_id = '99000000-0000-0000-0000-0000000000a1'),
  'Priority P3 to P1: Blocking the main path', 'the change and its reason are in the history');
select is((select sla_due from jsonb_to_record(wo_detail('99000000-0000-0000-0000-0000000000a1')) as x(sla_due timestamptz)),
  (select created_at + interval '4 hours' from work_order where id = '99000000-0000-0000-0000-0000000000a1'),
  'the response time follows the new priority (P1: 4 hours)');
select * from finish();
rollback;
