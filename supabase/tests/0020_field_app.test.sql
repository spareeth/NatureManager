-- Task 2.6: field app. My day, the job for the phone, SOP answers while in progress, complete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;
delete from pm_schedule; delete from wo_template; delete from sop;

create temp table tg as select s.id site, s.organisation_id org,
  (select id from team t where t.organisation_id = s.organisation_id and t.name = 'Green Team East') team_east
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- An approved SOP with a required tick, an optional number and a required photo step.
insert into sop (id, organisation_id, code, title, status, approved_at)
select '90000000-0000-0000-0000-0000000000c1', org, 'SOP-BED', '{"en": "Bed care"}', 'approved', now() from tg;
insert into sop_step (id, organisation_id, sop_id, seq, text, input_type, required)
select v.id::uuid, org, '90000000-0000-0000-0000-0000000000c1', v.seq, v.t::jsonb, v.k, v.req from tg,
  (values ('90000000-0000-0000-0000-0000000000d1', 1, '{"en": "Weed"}', 'tick', true),
          ('90000000-0000-0000-0000-0000000000d2', 2, '{"en": "Depth"}', 'number', false),
          ('90000000-0000-0000-0000-0000000000d3', 3, '{"en": "Photo"}', 'photo', true)) v(id, seq, t, k, req);
-- Another SOP whose step does not belong to the job.
insert into sop (id, organisation_id, code, title, status, approved_at)
select '90000000-0000-0000-0000-0000000000c2', org, 'SOP-OTHER', '{"en": "Other"}', 'approved', now() from tg;
insert into sop_step (id, organisation_id, sop_id, seq, text, input_type)
select '90000000-0000-0000-0000-0000000000d9', org, '90000000-0000-0000-0000-0000000000c2', 1, '{"en": "x"}', 'tick' from tg;

-- Jobs: a1 green1 today, a2 team East today, a3 green1 yesterday still open, a4 green1 tomorrow,
-- a5 green2 today, a6 green1 yesterday completed (not carried over).
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, sop_id, assignee_user_id, team_id,
                        planned_start, location_id)
select v.id::uuid, org, site, 'manual', 'preventive', v.title, v.st::wo_status, '90000000-0000-0000-0000-0000000000c1',
       v.who::uuid, case when v.team then team_east end,
       (('2026-11-02'::date + v.d)::timestamp + time '07:00') at time zone 'Asia/Dubai',
       (select id from location l where l.organisation_id = tg.org and l.code = v.loc)
from tg, (values
  ('90000000-0000-0000-0000-0000000000a1', 'Today mine',   'scheduled', '10000000-0000-0000-0000-000000000005', false, 0, 'NG-01'),
  ('90000000-0000-0000-0000-0000000000a2', 'Today team',   'scheduled', null,                                   true,  0, 'EG-01'),
  ('90000000-0000-0000-0000-0000000000a3', 'Carried over', 'in_progress', '10000000-0000-0000-0000-000000000005', false, -1, 'WG-01'),
  ('90000000-0000-0000-0000-0000000000a4', 'Tomorrow',     'scheduled', '10000000-0000-0000-0000-000000000005', false, 1, 'EG-02'),
  ('90000000-0000-0000-0000-0000000000a5', 'Not mine',     'scheduled', '10000000-0000-0000-0000-000000000006', false, 0, 'EG-03'),
  ('90000000-0000-0000-0000-0000000000a6', 'Done before',  'completed', '10000000-0000-0000-0000-000000000005', false, -1, 'EG-04')
) v(id, title, st, who, team, d, loc);

-- As green1 (Green Team East) -------------------------------------------------------------
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is((select jsonb_agg(x ->> 'title') from jsonb_array_elements(field_my_day((select site from tg), '2026-11-02')) x),
  '["Today team", "Today mine", "Carried over"]'::jsonb, 'my day: mine and my team, plus unfinished earlier jobs, sorted by location');
select is((select field_my_day(site, '2026-11-02') -> 0 ->> 'steps' from tg), '3', 'my day shows the number of SOP steps');

select throws_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
  select org, '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000d1', 'true' from tg$$,
  '42501', null, 'no answers before the job is started');
select lives_ok($$select wo_transition('90000000-0000-0000-0000-0000000000a1', 'in_progress', null)$$, 'assignee starts the job');
select lives_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
  select org, '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000d1', 'true' from tg$$, 'answer a tick step');
select is((select answered_by from sop_response where sop_step_id = '90000000-0000-0000-0000-0000000000d1'),
  '10000000-0000-0000-0000-000000000005'::uuid, 'the answer records who gave it');
select throws_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
  select org, '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000d9', 'true' from tg$$,
  '22023', null, 'steps of another SOP are refused');
select throws_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
  select org, '90000000-0000-0000-0000-0000000000a5', '90000000-0000-0000-0000-0000000000d1', 'true' from tg$$,
  '42501', null, 'cannot answer for someone else''s job');

select is((select field_job('90000000-0000-0000-0000-0000000000a1') -> 'missing'), '[3]'::jsonb, 'the job lists the missing required photo step');
select is((select jsonb_array_length(field_job('90000000-0000-0000-0000-0000000000a1') -> 'steps')), 3, 'the job carries its steps');
select throws_ok($$select wo_transition('90000000-0000-0000-0000-0000000000a1', 'completed', null)$$, null, null,
  'complete is refused while a required step is missing');

-- Photo answer, notes, materials and minutes, then complete.
insert into media (id, organisation_id, bucket, path, kind, work_order_id)
select '90000000-0000-0000-0000-0000000000e1', org, 'photos', org || '/wo/90000000-0000-0000-0000-0000000000a1/p.jpg', 'photo',
       '90000000-0000-0000-0000-0000000000a1' from tg;
insert into sop_response (organisation_id, work_order_id, sop_step_id, media_id)
select org, '90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000d3', '90000000-0000-0000-0000-0000000000e1' from tg;
select lives_ok($$update work_order set completion_notes = 'Done, bed weeded', actual_minutes = 45,
  materials = '[{"item": "mulch", "qty": 2, "unit": "m3"}]' where id = '90000000-0000-0000-0000-0000000000a1'$$, 'assignee records notes, minutes and materials');
select is((select jsonb_array_length(field_job('90000000-0000-0000-0000-0000000000a1') -> 'photos')), 1, 'the job lists its photos');
select lives_ok($$select wo_transition('90000000-0000-0000-0000-0000000000a1', 'completed', 'done')$$, 'complete once every required step is answered');
select throws_ok($$update sop_response set value = 'false' where sop_step_id = '90000000-0000-0000-0000-0000000000d1'$$,
  '42501', null, 'answers are locked once the job is completed');

-- Organisation B sees nothing.
reset role;
select pg_temp.as_user('20000000-0000-0000-0000-000000000002');
set local role authenticated;
select is((select field_job('90000000-0000-0000-0000-0000000000a1')), null, 'another organisation cannot read the job');

select * from finish();
rollback;
