-- Task 2.1: work order tables, numbering, status guard and permissions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temp table tg as
  select s.id site, s.organisation_id org, (select id from team where name = 'Green Team East') east,
         (select id from team where name = 'Green Team West') west
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated, anon;
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('dddddddd-1111-0000-0000-000000000000', 'Other', 'other-wo');
insert into membership (organisation_id, user_id, roles, display_name)
values ('dddddddd-1111-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000b', '{manager}', 'Other');
insert into site (id, organisation_id, code, name, site_type, boundary)
select 'dddddddd-1111-0000-0000-0000000000f1', 'dddddddd-1111-0000-0000-000000000000', 'OX', 'Other', 'park', boundary
from site where code = 'TG' limit 1;

-- Data rules ------------------------------------------------------------------------------
select throws_ok($$insert into sop (organisation_id, code, title) select org, 'S1', '{"ar": "x"}' from tg$$,
  '23514', null, 'SOP title needs English');
insert into sop (id, organisation_id, code, title, status, approved_at)
select 'd0000000-0000-0000-0000-0000000000c1', org, 'SOP-BED', '{"en": "Bed care", "ar": "العناية بالحوض"}', 'approved', now() from tg;
select throws_ok($$insert into sop_step (organisation_id, sop_id, seq, text, input_type)
                   select org, 'd0000000-0000-0000-0000-0000000000c1', 1, '{"en": "Pick"}', 'choice' from tg$$,
  '23514', null, 'a choice step needs choices');
insert into sop_step (id, organisation_id, sop_id, seq, text, input_type, required)
select 'd0000000-0000-0000-0000-0000000000c2', org, 'd0000000-0000-0000-0000-0000000000c1', 1, '{"en": "Weed the bed"}', 'tick', true from tg;
insert into wo_template (id, organisation_id, code, title, wo_type, sop_id, team_id)
select 'd0000000-0000-0000-0000-0000000000c3', org, 'PM-BED-CARE', 'Bed care', 'preventive', 'd0000000-0000-0000-0000-0000000000c1', east from tg;
select throws_ok($$insert into pm_schedule (organisation_id, template_id, target_kind, target_location_id, target_asset_type_id, rule)
                   select org, 'd0000000-0000-0000-0000-0000000000c3', 'location',
                          (select id from location where code = 'EG-01'), (select id from asset_type where code = 'TREE' and organisation_id = org),
                          '{"freq": "weekly"}' from tg$$,
  '23514', null, 'a location schedule cannot also name an asset type');
select throws_ok($$insert into pm_schedule (organisation_id, template_id, target_kind, target_location_id, rule)
                   select org, 'd0000000-0000-0000-0000-0000000000c3', 'location', (select id from location where code = 'EG-01'),
                          '{"freq": "hourly"}' from tg$$,
  '23514', null, 'unknown rule frequency rejected');
select lives_ok($$insert into pm_schedule (organisation_id, template_id, target_kind, target_location_id, rule, max_per_day)
                  select org, 'd0000000-0000-0000-0000-0000000000c3', 'location', (select id from location where code = 'EG-01'),
                         '{"freq": "weekly", "interval": 1, "byweekday": [0, 1, 2, 3, 4]}', 10 from tg$$,
  'a weekly bed schedule is accepted');
select throws_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status)
                   select 'dddddddd-1111-0000-0000-000000000000', site, 'manual', 'reactive', 'x', 'requested' from tg$$,
  '23503', null, 'a work order cannot use another organisation''s site');

-- Numbering -----------------------------------------------------------------------------------
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, team_id, sop_id)
select v.id::uuid, org, site, 'manual', 'preventive', v.title, 'scheduled', east, 'd0000000-0000-0000-0000-0000000000c1'
from tg, (values ('d0000000-0000-0000-0000-00000000a001', 'Bed care EG-01'), ('d0000000-0000-0000-0000-00000000a002', 'Bed care EG-02')) v(id, title);
select ok((select a.number ~ ('^WO-' || extract(year from now() at time zone 'Asia/Dubai')::int || '-[0-9]{6}$')
                  and right(b.number, 6)::int = right(a.number, 6)::int + 1
           from work_order a, work_order b
           where a.id = 'd0000000-0000-0000-0000-00000000a001' and b.id = 'd0000000-0000-0000-0000-00000000a002'),
  'numbers are WO-YYYY-NNNNNN and run on per organisation');
insert into work_order (organisation_id, site_id, source, wo_type, title, status)
values ('dddddddd-1111-0000-0000-000000000000', 'dddddddd-1111-0000-0000-0000000000f1', 'manual', 'reactive', 'Other job', 'requested');
select is((select right(number, 6) from work_order where title = 'Other job'), '000001', 'another organisation starts its own sequence');
select throws_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status, number)
                   select org, site, 'manual', 'reactive', 'dup', 'requested', (select number from work_order where id = 'd0000000-0000-0000-0000-00000000a001') from tg$$,
  '23505', null, 'numbers are unique per organisation');

-- Status guard (CLAUDE.md rule 4) ------------------------------------------------------------------
select throws_ok($$update work_order set status = 'in_progress' where id = 'd0000000-0000-0000-0000-00000000a001'$$,
  '42501', null, 'direct status update refused, even for the database owner');
select lives_ok($$update work_order set title = 'Bed care EG-01 (east)' where id = 'd0000000-0000-0000-0000-00000000a001'$$,
  'other fields can be edited');

-- As green1 (Green Team East) -----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select lives_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status)
                  select org, site, 'request', 'reactive', 'Broken sign at SG-03', 'requested' from tg$$,
  'green team raises a request');
select throws_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status)
                   select org, site, 'manual', 'reactive', 'Self-scheduled', 'scheduled' from tg$$,
  '42501', null, 'green team cannot create scheduled work');
update work_order set completion_notes = 'Weeded and mulched', actual_minutes = 40 where id = 'd0000000-0000-0000-0000-00000000a001';
select is((select actual_minutes from work_order where id = 'd0000000-0000-0000-0000-00000000a001'), 40, 'team member records work on the team''s job');
select wo_transition('d0000000-0000-0000-0000-00000000a001', 'in_progress', null); -- answers need a started job (task 2.6)
select lives_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
                  select org, 'd0000000-0000-0000-0000-00000000a001', 'd0000000-0000-0000-0000-0000000000c2', 'true' from tg$$,
  'team member answers an SOP step');
select throws_ok($$insert into work_order_event (organisation_id, work_order_id, to_status, actor)
                   select org, 'd0000000-0000-0000-0000-00000000a001', 'completed', auth.uid() from tg$$,
  '42501', null, 'clients cannot write events directly');
select throws_ok($$insert into sop (organisation_id, code, title) select org, 'X', '{"en": "x"}' from tg$$,
  '42501', null, 'green team cannot edit SOPs');

-- As green2 (Green Team West): not their job.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
update work_order set completion_notes = 'not mine' where id = 'd0000000-0000-0000-0000-00000000a002';
select throws_ok($$insert into sop_response (organisation_id, work_order_id, sop_step_id, value)
                   select org, 'd0000000-0000-0000-0000-00000000a002', 'd0000000-0000-0000-0000-0000000000c2', 'true' from tg$$,
  '42501', null, 'another team cannot answer SOP steps on this job');

-- As the owner (read-only, but may raise a request).
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status)
                  select org, site, 'request', 'reactive', 'Owner noticed a leak', 'requested' from tg$$,
  'owner raises a request');
update work_order set priority = 'P1' where id = 'd0000000-0000-0000-0000-00000000a002';

-- As the field manager.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok($$insert into work_order (organisation_id, site_id, source, wo_type, title, status, assignee_user_id)
                  select org, site, 'manual', 'inspection', 'Safety walk', 'scheduled', auth.uid() from tg$$,
  'field manager creates scheduled work');
select throws_ok($$update work_order set status = 'cancelled' where title = 'Safety walk'$$, '42501', null,
  'field manager also cannot change status directly');

-- The other organisation sees none of this.
select set_config('request.jwt.claims', '{"sub":"d0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select results_eq($$select (select count(*) from work_order where organisation_id <> 'dddddddd-1111-0000-0000-000000000000')::int,
                           (select count(*) from sop)::int, (select count(*) from sop_response)::int$$,
  $$values (0, 0, 0)$$, 'other organisation sees no Terra work orders, SOPs or answers');

reset role;
select is((select completion_notes from work_order where id = 'd0000000-0000-0000-0000-00000000a002'), null, 'another team''s edit had no effect');
select is((select priority from work_order where id = 'd0000000-0000-0000-0000-00000000a002'), 'P3', 'owner''s edit had no effect');

select * from finish();
rollback;
