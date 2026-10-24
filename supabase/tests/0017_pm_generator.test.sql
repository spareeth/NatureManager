-- Task 2.3: rule periods, targets, generator (spreading, idempotency, SOP pinning), auto-close.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- Rule periods on fixed dates (Mon 2026-11-02 .. Sun 2026-11-15) ---------------------------------
create function pg_temp.days(r jsonb, a date, f date, t date, w int[] default '{0,1,2,3,4}') returns text language sql as
  $$ select string_agg(to_char(d, 'MM-DD'), ' ' order by d) from pm_periods(r, a, f, t, w) p, unnest(p.days) d $$;
select is(pg_temp.days('{"freq":"daily","interval":2}', '2026-11-02', '2026-11-02', '2026-11-08'),
  '11-02 11-04 11-06 11-08', 'daily every 2 days from the anchor');
select is(pg_temp.days('{"freq":"daily","byweekday":[0,1,2,3,4]}', '2026-11-01', '2026-11-06', '2026-11-09'),
  '11-06 11-09', 'daily on working weekdays only');
select is(pg_temp.days('{"freq":"weekly","byweekday":[0,3]}', '2026-11-02', '2026-11-02', '2026-11-15'),
  '11-02 11-05 11-09 11-12', 'weekly on Monday and Thursday');
select is(pg_temp.days('{"freq":"weekly","interval":2,"byweekday":[0]}', '2026-11-02', '2026-11-02', '2026-11-29'),
  '11-02 11-16', 'every 2 weeks from the anchor week');
select is(pg_temp.days('{"freq":"weekly"}', '2026-11-02', '2026-11-02', '2026-11-08', '{0,1,2,3,4,5}'),
  '11-02 11-03 11-04 11-05 11-06 11-07', 'weekly without weekdays uses the working week (Mon to Sat)');
select is(pg_temp.days('{"freq":"monthly","bymonthday":[1,15]}', '2026-01-01', '2026-11-01', '2026-12-31'),
  '11-01 11-15 12-01 12-15', 'monthly on the 1st and 15th');
select is(pg_temp.days('{"freq":"monthly","interval":3,"bymonthday":[1]}', '2026-01-01', '2026-01-01', '2026-12-31'),
  '01-01 04-01 07-01 10-01', 'every 3 months');
select ok(in_season('{"season":{"from_month":10,"to_month":4}}', '2026-12-15') and in_season('{"season":{"from_month":10,"to_month":4}}', '2027-03-01')
          and not in_season('{"season":{"from_month":10,"to_month":4}}', '2026-07-01'),
  'a season from October to April wraps the year end');
select is(pg_temp.days('{"freq":"monthly","bymonthday":[1],"season":{"from_month":10,"to_month":4}}', '2026-01-01', '2026-03-01', '2026-11-30'),
  '03-01 04-01 10-01 11-01', 'monthly within the season only');
select is(org_working_days((select id from organisation where slug = 'terra')), '{0,1,2,3,4,5}', 'Terra works Monday to Saturday (seed)');

-- Generator -------------------------------------------------------------------------------
-- Start from the seed alone, even when the local database also holds migrated Hortis data
-- (rolled back with the test).
delete from work_order_event; delete from sop_response; delete from work_order_asset; delete from work_order; delete from pm_schedule;
delete from media; delete from asset_status_change; delete from asset; delete from accession; delete from item_request; delete from item; delete from org_taxon; delete from taxon;
create temp table tg as select o.id org, org_today(o.id) today, (select id from team where name = 'Green Team East') east
  from organisation o where o.slug = 'terra';
grant select on tg to authenticated;
insert into sop (id, organisation_id, code, version, title, status, approved_at)
select v.id::uuid, org, 'SOP-BED', v.ver, '{"en": "Bed care"}', v.st, case when v.st = 'approved' then now() end from tg,
  (values ('f1000000-0000-0000-0000-0000000000c1', 1, 'approved'), ('f1000000-0000-0000-0000-0000000000c2', 2, 'approved'),
          ('f1000000-0000-0000-0000-0000000000c3', 3, 'draft')) v(id, ver, st);
insert into wo_template (id, organisation_id, code, title, wo_type, sop_id, team_id, est_minutes)
select v.id::uuid, org, v.code, v.title, 'preventive', v.sop::uuid, case when v.team then east end, 45 from tg,
  (values ('f1000000-0000-0000-0000-0000000000e1', 'PM-BED-CARE', 'Bed care', 'f1000000-0000-0000-0000-0000000000c1', true),
          ('f1000000-0000-0000-0000-0000000000e2', 'PM-NO-TEAM', 'Unassigned check', null, false)) v(id, code, title, sop, team);
-- NG beds weekly Mon-Fri max 10 (15 beds -> 3 a day)
insert into pm_schedule (id, organisation_id, template_id, target_kind, target_location_id, rule, max_per_day, horizon_days)
select 'f1000000-0000-0000-0000-0000000000b1', org, 'f1000000-0000-0000-0000-0000000000e1', 'location',
       (select id from location where code = 'NG' and kind = 'zone' and organisation_id = org),
       '{"freq":"weekly","byweekday":[0,1,2,3,4],"each":"bed"}', 10, 14 from tg;

select is((select count(*)::int from pm_targets('f1000000-0000-0000-0000-0000000000b1')), 15, '"each": "bed" targets the 15 North Garden beds');
select ok((select (pm_generate(org) ->> 'created')::int > 0 from tg), 'first run creates work orders');
select is((select (pm_generate(org) ->> 'created')::int from tg), 0, 'second run creates nothing (idempotent)');
select is((select max(n)::int from (select count(*) n from work_order group by (planned_start at time zone 'Asia/Dubai')::date) x), 3,
  'work is spread evenly: at most 3 beds a day');
select is((select count(*)::int from work_order where extract(isodow from planned_start at time zone 'Asia/Dubai') > 5), 0, 'no weekend work');
select results_eq($$select distinct status::text, source, (sop_id = 'f1000000-0000-0000-0000-0000000000c2') from work_order$$,
  $$values ('scheduled'::text, 'pm'::text, true)$$,
  'preventive work is scheduled, source pm, pinned to the latest approved SOP version (v2, not draft v3)');
select ok((select bool_and(to_char(planned_start at time zone 'Asia/Dubai', 'HH24:MI') = '07:00'
                     and (due_at at time zone 'Asia/Dubai')::date = (planned_start at time zone 'Asia/Dubai')::date) from work_order),
  'starts 07:00 Dubai time, due the same day');

-- Regression: a horizon that ends on a Monday must not crowd that Monday with the whole week's beds.
delete from work_order_event; delete from work_order_asset; delete from work_order where pm_schedule_id = 'f1000000-0000-0000-0000-0000000000b1';
select is((select (pm_generate(org, today - weekday0(today) + 7) ->> 'over_capacity')::int from tg), 0,
  'a horizon cut mid-week reports no overflow');
select is((select max(n)::int from (select count(*) n from work_order group by (planned_start at time zone 'Asia/Dubai')::date) x), 3,
  'the cut day gets only its share (3), not the whole week');
select is((select (pm_generate(org) ->> 'created')::int > 0 from tg), true, 'a later run adds the rest of that week');
select is((select max(n)::int from (select count(*) n from work_order group by (planned_start at time zone 'Asia/Dubai')::date) x), 3,
  'and still 3 a day');

-- A manager moves a job to another day: the next run does not recreate it.
update work_order set planned_start = planned_start + interval '1 day', planned_end = planned_end + interval '1 day'
where id = (select id from work_order order by number limit 1);
select is((select (pm_generate(org) ->> 'created')::int from tg), 0, 'a moved job is not recreated');

-- Asset targets: trees in WG-07 (live only), and work_order_asset rows.
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status)
select v.id::uuid, org, (select id from site where code = 'TG' and organisation_id = org),
       (select id from asset_type where code = 'TREE' and organisation_id = org), v.tag,
       (select st_pointonsurface(geom) from location where code = 'WG-07'), v.st::asset_status from tg,
  (values ('f1000000-0000-0000-0000-0000000000a1', 'WG07-T91_TST', 'established'), ('f1000000-0000-0000-0000-0000000000a2', 'WG07-T92_TST', 'dead')) v(id, tag, st);
insert into pm_schedule (id, organisation_id, template_id, target_kind, target_asset_type_id, target_location_id, rule, horizon_days)
select 'f1000000-0000-0000-0000-0000000000b2', org, 'f1000000-0000-0000-0000-0000000000e2', 'asset_type_in_location',
       (select id from asset_type where code = 'TREE' and organisation_id = org), (select id from location where code = 'WG-07'),
       '{"freq":"daily"}', 1 from tg;
select is((select array_agg(label) from pm_targets('f1000000-0000-0000-0000-0000000000b2')), '{WG07-T91_TST}', 'dead trees are not targeted');
select lives_ok($$select pm_generate(org) from tg$$, 'generator runs with an asset schedule');
select results_eq($$select w.status::text, a.asset_id from work_order w join work_order_asset a on a.work_order_id = w.id
                    where w.pm_schedule_id = 'f1000000-0000-0000-0000-0000000000b2' limit 1$$,
  $$values ('approved'::text, 'f1000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'a template without a team creates approved work, linked to the asset');

-- Inactive schedules are skipped.
update pm_schedule set active = false where id = 'f1000000-0000-0000-0000-0000000000b2';
select is((select (pm_generate(org) ->> 'schedules')::int from tg), 1, 'inactive schedules are skipped');

-- Who may run it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$select pm_generate(org, today + 30) from tg$$, '42501', null, 'green team cannot generate work');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok($$select pm_generate(org, today + 30) from tg$$, 'field manager can generate work');
reset role;

-- Auto-close after 24 h ----------------------------------------------------------------------
create temp table v as select id from work_order where pm_schedule_id = 'f1000000-0000-0000-0000-0000000000b1' order by number limit 2;
select set_config('app.wo_transition', 'on', true);
update work_order set status = 'verified' where id in (select id from v);
select set_config('app.wo_transition', '', true);
insert into work_order_event (organisation_id, work_order_id, from_status, to_status, actor, at)
select (select org from tg), id, 'completed', 'verified', '10000000-0000-0000-0000-000000000003',
       now() - case when row_number() over (order by id) = 1 then interval '25 hours' else interval '23 hours' end from v;
select is(wo_autoclose(), 1, 'only work verified more than 24 h ago is closed');
select results_eq($$select e.from_status::text, e.to_status::text, e.actor, e.source from work_order_event e
                    where e.to_status = 'closed'$$,
  $$values ('verified'::text, 'closed'::text, null::uuid, 'system'::text)$$, 'the close is a system event without an actor');
select throws_ok($$insert into work_order_event (organisation_id, work_order_id, to_status, actor)
                   select org, (select id from v limit 1), 'closed', null from tg$$,
  '23514', null, 'a user event must have an actor');
select results_eq($$select jobname, schedule from cron.job order by 1$$,
  $$values ('pm-generate-nightly'::text, '30 20 * * *'::text), ('wo-autoclose-hourly', '5 * * * *')$$,
  'nightly generation at 00:30 Dubai and hourly auto-close are scheduled');

select * from finish();
rollback;
