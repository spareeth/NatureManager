-- Base maps per site: rules on offline storage, one default, managers edit, members read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

select is((select array_agg(name order by sort_order) from site_basemap where site_id = (select site from tg)),
  '{OpenStreetMap,"Google satellite","Esri World Imagery"}', 'Terra has the standard layers');
select is((select name from site_basemap where site_id = (select site from tg) and is_default), 'Google satellite', 'Google satellite is the default');
select throws_ok($$insert into site_basemap (organisation_id, site_id, name, kind, offline_allowed) select org, site, 'G2', 'google', true from tg$$,
  '23514', null, 'Google tiles can never be marked for offline storage');
select throws_ok($$insert into site_basemap (organisation_id, site_id, name, kind, url) select org, site, 'Bad', 'xyz', 'https://example.org/tiles.png' from tg$$,
  '23514', null, 'an XYZ layer needs {z}, {x} and {y} in its URL');

select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is((select count(*)::int from site_basemap), 3, 'green team reads the layers');
select throws_ok($$insert into site_basemap (organisation_id, site_id, name, kind, url) select org, site, 'Mine', 'xyz', 'https://t.example.org/{z}/{x}/{y}.png' from tg$$,
  '42501', null, 'green team cannot add layers');

reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
insert into site_basemap (id, organisation_id, site_id, name, kind, url, offline_allowed, max_native_zoom, sort_order)
select '96000000-0000-0000-0000-0000000000b1', org, site, 'Drone 2026', 'xyz', 'https://tiles.example.org/tg/{z}/{x}/{y}.webp', true, 22, 5 from tg;
select lives_ok($$select site_basemap_set_default('96000000-0000-0000-0000-0000000000b1')$$, 'manager makes the own orthophoto the default');
select is((select array_agg(name) from site_basemap where is_default), '{"Drone 2026"}', 'exactly one default');
select throws_ok($$update site_basemap set is_default = true where name = 'OpenStreetMap'$$, '23505', null, 'a second default is refused');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from site_basemap), 0, 'another organisation sees no layers');
select throws_ok($$select site_basemap_set_default('96000000-0000-0000-0000-0000000000b1')$$, 'P0002', null, 'and cannot change the default');
select * from finish();
rollback;
