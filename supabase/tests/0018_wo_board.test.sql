-- Task 2.4: board, SLA and overdue flags, schedule, re-plan, bulk move.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
delete from work_order_event; delete from sop_response; delete from work_order_asset; delete from work_order;

create temp table tg as select s.id site, s.organisation_id org, (select id from team where name = 'Green Team East') east
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.st(id uuid, s wo_status) returns void language sql as $$
  select set_config('app.wo_transition', 'on', true); update work_order set status = s where work_order.id = st.id;
  select set_config('app.wo_transition', '', true); $$;

-- P1 request raised 5 h ago (SLA 4 h: breached); P3 request raised 1 h ago (72 h: fine);
-- scheduled job due yesterday (overdue); P2 job started 2 h after it was raised (24 h: met).
insert into work_order (id, organisation_id, site_id, source, wo_type, title, priority, status, created_at, due_at, planned_start, planned_end, team_id)
select v.id::uuid, org, site, 'request', 'reactive', v.title, v.p, v.st::wo_status, now() - v.age::interval, v.due::timestamptz,
       v.ps::timestamptz, v.ps::timestamptz + interval '1 hour', case when v.st <> 'requested' then east end
from tg, (values
  ('c1000000-0000-0000-0000-00000000a001', 'Burst pipe', 'P1', 'requested', '5 hours', null, null),
  ('c1000000-0000-0000-0000-00000000a002', 'Loose paver', 'P3', 'requested', '1 hour', null, null),
  ('c1000000-0000-0000-0000-00000000a003', 'Prune hedge', 'P3', 'scheduled', '2 days', (now() - interval '1 day')::text, (now() - interval '1 day 2 hours')::text),
  ('c1000000-0000-0000-0000-00000000a004', 'Valve leak', 'P2', 'scheduled', '6 hours', (now() + interval '1 day')::text, now()::text)
) v(id, title, p, st, age, due, ps);
select pg_temp.st('c1000000-0000-0000-0000-00000000a004', 'in_progress');
insert into work_order_event (organisation_id, work_order_id, from_status, to_status, actor, at)
select org, 'c1000000-0000-0000-0000-00000000a004', 'scheduled', 'in_progress', '10000000-0000-0000-0000-000000000005', now() - interval '4 hours' from tg;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
create temp view b as select r ->> 'title' title, (r ->> 'sla_breached')::boolean breached, (r ->> 'sla_met')::boolean met,
  (r ->> 'overdue')::boolean overdue, r ->> 'team_name' team from tg, jsonb_array_elements(wo_board(tg.site)) r;
select results_eq($$select title, breached, met, overdue from b order by title$$,
  $$values ('Burst pipe'::text, true, false, false), ('Loose paver', false, false, false),
            ('Prune hedge', false, false, true), ('Valve leak', false, true, false)$$,
  'SLA breached (P1 not started in 4 h), met (P2 started in 2 h) and overdue flags');
select is((select jsonb_array_length(wo_board(site, '{requested}')) from tg), 2, 'inbox filter: requested only');
select is((select team from b where title = 'Prune hedge'), 'Green Team East', 'board carries the team name');
select is((select org_sla_hours(org, 'P1') from tg), 4, 'default P1 SLA 4 h');
reset role;
update organisation set settings = settings || '{"sla_hours": {"P1": 2}}' where slug = 'terra';
select is((select org_sla_hours(org, 'P1') from tg), 2, 'SLA hours come from organisation settings when set');

-- Schedule the P1 request: approved then scheduled, both as events.
set local role authenticated;
select lives_ok($$select wo_schedule('c1000000-0000-0000-0000-00000000a001', '10000000-0000-0000-0000-000000000007', null,
                                      date_trunc('hour', now()) + interval '2 hours', 90, 'Engineer sent')$$,
  'manager schedules a request with an assignee and time');
reset role;
select results_eq($$select from_status::text, to_status::text from work_order_event where work_order_id = 'c1000000-0000-0000-0000-00000000a001' order by at, to_status$$,
  $$values ('requested'::text, 'approved'::text), ('approved', 'scheduled')$$, 'scheduling a request approves it first, through wo_transition');
select results_eq($$select status::text, assignee_user_id, extract(epoch from planned_end - planned_start)::int / 60 from work_order where id = 'c1000000-0000-0000-0000-00000000a001'$$,
  $$values ('scheduled'::text, '10000000-0000-0000-0000-000000000007'::uuid, 90)$$, 'assignee, start and duration are set');

-- Re-plan keeps the duration; started work cannot be re-planned.
set local role authenticated;
select lives_ok($$select wo_replan('c1000000-0000-0000-0000-00000000a001', date_trunc('hour', now()) + interval '1 day')$$, 'drag to tomorrow');
reset role;
select is((select extract(epoch from planned_end - planned_start)::int / 60 from work_order where id = 'c1000000-0000-0000-0000-00000000a001'), 90, 'duration kept on re-plan');
set local role authenticated;
select throws_ok($$select wo_replan('c1000000-0000-0000-0000-00000000a004', now() + interval '2 days')$$, '42501', null, 'work in progress cannot be re-planned');

-- Bulk move a day.
select is((select wo_bulk_move(site, ((now() + interval '1 day') at time zone 'Asia/Dubai')::date, ((now() + interval '3 days') at time zone 'Asia/Dubai')::date) from tg),
  1, 'bulk move shifts the day''s open work');
reset role;
select is((select ((planned_start at time zone 'Asia/Dubai')::date - (now() at time zone 'Asia/Dubai')::date) from work_order where id = 'c1000000-0000-0000-0000-00000000a001'), 3,
  'the job is now three days out');

-- Green team cannot plan; another organisation sees nothing.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select wo_schedule('c1000000-0000-0000-0000-00000000a002', auth.uid(), null, now())$$, '42501', null, 'green team cannot schedule');
select is((select wo_bulk_move(site, current_date, current_date + 1) from tg), 0, 'green team bulk move changes nothing');
select is((select jsonb_array_length(wo_board(site)) from tg), 4, 'green team can view the board');
reset role;
insert into auth.users (id, email) values ('c1000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('cccccccc-3333-0000-0000-000000000000', 'Other', 'other-board');
insert into membership (organisation_id, user_id, roles, display_name) values ('cccccccc-3333-0000-0000-000000000000', 'c1000000-0000-0000-0000-00000000000b', '{manager}', 'Other');
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select jsonb_array_length(wo_board(site)), wo_detail('c1000000-0000-0000-0000-00000000a001') is null from tg$$,
  $$values (0, true)$$, 'another organisation sees no board and no detail');
reset role;

select * from finish();
rollback;
