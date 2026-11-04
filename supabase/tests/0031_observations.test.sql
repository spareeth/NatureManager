-- Task 3.1: observations and AI suggestions: location from the point, observer, verification rules, RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
create temp table tg as select s.id site, s.organisation_id org,
  (select id from location l where l.organisation_id = s.organisation_id and l.code = 'NG-02') bed
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
insert into taxon (id, kingdom, scientific_name, rank) values ('9b000000-0000-0000-0000-0000000000d1', 'Animalia', 'Testus avis', 'species')
  on conflict do nothing;

-- Green One records a sighting in NG-02
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
insert into observation (id, organisation_id, site_id, obs_type, geom, gps_accuracy_m, count, life_stage, notes)
select '9b000000-0000-0000-0000-0000000000a1', org, site, 'fauna', (select st_pointonsurface(geom) from location where id = bed), 4, 2, 'adult', 'Two birds'
from tg;
select is((select location_id from observation where id = '9b000000-0000-0000-0000-0000000000a1'), (select bed from tg),
  'the bed is found from the point');
select is((select observer from observation where id = '9b000000-0000-0000-0000-0000000000a1'), '10000000-0000-0000-0000-000000000005'::uuid,
  'the observer is the signed-in user');
select is((select verification from observation where id = '9b000000-0000-0000-0000-0000000000a1'), 'ai_suggested', 'starts as ai_suggested');
select throws_ok($$insert into observation (organisation_id, site_id, obs_type, geom, observer)
  select org, site, 'flora', extensions.st_setsrid(extensions.st_makepoint(55.1545, 24.9588), 4326), '10000000-0000-0000-0000-000000000006' from tg$$,
  '42501', null, 'nobody records an observation in someone else''s name');
select throws_ok($$insert into observation (organisation_id, site_id, obs_type, geom) select org, site, 'phenology',
  extensions.st_setsrid(extensions.st_makepoint(55.1545, 24.9588), 4326) from tg$$, '23514', null, 'phenology needs a phenophase');
select throws_ok($$insert into observation (organisation_id, site_id, obs_type, geom) select org, site, 'unicorn',
  extensions.st_setsrid(extensions.st_makepoint(55.1545, 24.9588), 4326) from tg$$, '23514', null, 'only the listed types');
insert into ai_suggestion (organisation_id, observation_id, engine, model_version, rank, taxon_name, taxon_id, score, in_collection)
select org, '9b000000-0000-0000-0000-0000000000a1', 'bioclip2', 'v2', v.r, v.n, v.t::uuid, v.s, v.c from tg,
  (values (1, 'Testus avis', '9b000000-0000-0000-0000-0000000000d1', 0.81, true), (2, 'Testus alter', null, 0.12, false)) v(r, n, t, s, c);
select is((select count(*)::int from ai_suggestion where observation_id = '9b000000-0000-0000-0000-0000000000a1'), 2,
  'the observer adds ranked suggestions');
update ai_suggestion set score = 0.99 where observation_id = '9b000000-0000-0000-0000-0000000000a1';
select is((select max(score) from ai_suggestion where observation_id = '9b000000-0000-0000-0000-0000000000a1'), 0.81::numeric,
  'suggestions are never edited (no update policy: the change does nothing)');
update observation set taxon_id = '9b000000-0000-0000-0000-0000000000d1', verification = 'observer_confirmed'
 where id = '9b000000-0000-0000-0000-0000000000a1';
select is((select verification from observation where id = '9b000000-0000-0000-0000-0000000000a1'), 'observer_confirmed',
  'the observer picks a suggestion and confirms');
select throws_ok($$update observation set verification = 'curator_verified' where id = '9b000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'the observer cannot verify as curator');

-- Green Two cannot change it
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
set local role authenticated;
update observation set notes = 'changed' where id = '9b000000-0000-0000-0000-0000000000a1';
select is((select notes from observation where id = '9b000000-0000-0000-0000-0000000000a1'), 'Two birds', 'another observer cannot edit it');

-- The curator verifies
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000004');
set local role authenticated;
update observation set verification = 'curator_verified' where id = '9b000000-0000-0000-0000-0000000000a1';
select results_eq($$select verification, verified_by from observation where id = '9b000000-0000-0000-0000-0000000000a1'$$,
  $$values ('curator_verified'::text, '10000000-0000-0000-0000-000000000004'::uuid)$$, 'the curator verifies, recorded with who');
select ok((select verified_at is not null from observation where id = '9b000000-0000-0000-0000-0000000000a1'), 'and when');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select throws_ok($$update observation set notes = 'later' where id = '9b000000-0000-0000-0000-0000000000a1'$$, '42501', null,
  'a verified observation is changed by curators and managers only');
select is((select count(*)::int from audit_log where table_name = 'observation' and row_id = '9b000000-0000-0000-0000-0000000000a1'), 0,
  'the audit log is not readable by green team (managers and owners only)');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from observation where id = '9b000000-0000-0000-0000-0000000000a1'), 0, 'another organisation sees nothing');
select * from finish();
rollback;
