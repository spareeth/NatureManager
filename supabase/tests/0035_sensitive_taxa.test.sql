-- Task 3.6: positions of sensitive species are exact for curators and managers only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
\ir fixture_trees.inc
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- A tree in NG-02 whose species is marked sensitive, and one of an ordinary species.
create temp table tg as
select a.id sens, a.organisation_id org, a.site_id site, a.location_id bed, a.taxon_id taxon, a.geom exact,
       (select st_pointonsurface(l.geom) from location l where l.id = a.location_id) bed_pt,
       (select b.id from asset b where b.organisation_id = a.organisation_id and b.taxon_id is distinct from a.taxon_id
          and b.taxon_id is not null limit 1) plain
  from asset a join location l on l.id = a.location_id
 where l.code = 'NG-02' and a.taxon_id is not null and geometrytype(a.geom) = 'POINT'
   and not st_equals(a.geom, st_pointonsurface(l.geom)) limit 1;
update org_taxon set sensitive = false, iucn_category = 'LC', protection_level = null
 where (organisation_id, taxon_id) = (select org, (select taxon_id from asset where id = plain) from tg);
update org_taxon set sensitive = true where (organisation_id, taxon_id) = (select org, taxon from tg);
grant select on tg to authenticated;

-- Green team
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select ok(st_equals(asset_geom((select sens from tg)), (select bed_pt from tg)), 'green team: the sensitive tree is shown at its bed');
select ok(not st_equals(asset_geom((select sens from tg)), (select exact from tg)), 'green team: not at its exact point');
select is((select x from asset_local_xy((select sens from tg))), null, 'green team: no site grid coordinates');
select ok(st_equals(asset_geom((select plain from tg)), (select geom from (select null::geometry geom) x) ) is not true
          and asset_geom((select plain from tg)) is not null, 'green team: an ordinary tree keeps its point');
select is((asset_detail((select sens from tg)) ->> 'position_hidden')::boolean, true, 'asset page says the position is hidden');
select is(round(((asset_detail((select sens from tg)) ->> 'lon'))::numeric, 6),
          round(st_x((select bed_pt from tg))::numeric, 6), 'asset page gives the bed point');
select is(round((field_scan((select sens from tg)) ->> 'lat')::numeric, 6), round(st_y((select bed_pt from tg))::numeric, 6),
          'scan gives the bed point');
select ok(exists(select 1 from jsonb_array_elements(map_assets((select site from tg), 55.14, 24.95, 55.17, 24.97) -> 'rows') r
                 where r ->> 2 = (select tag_code from asset where id = (select sens from tg))
                   and round((r ->> 1)::numeric, 6) = round(st_y((select bed_pt from tg))::numeric, 6)),
          'map shows it at the bed point');
select throws_ok($$select geom from asset limit 1$$, '42501', null, 'positions cannot be read directly');
select throws_ok($$select geom from observation limit 1$$, '42501', null, 'observation points cannot be read directly');
select throws_ok(format($$select asset_move_offset(%L, 1, 1)$$, (select sens from tg)), '42501', null,
  'green team cannot move a sensitive tree (it would move from the bed point)');

-- A sighting of the sensitive species: the work order from it is placed at the bed
insert into observation (id, organisation_id, site_id, obs_type, geom, taxon_id, verification, notes)
select '9d000000-0000-0000-0000-0000000000a1', org, site, 'flora', exact, taxon, 'observer_confirmed', 'rare one' from tg;
select ok(st_equals(observation_geom('9d000000-0000-0000-0000-0000000000a1'), (select bed_pt from tg)), 'the sighting is shown at its bed');
create temp table w9 as select wo_from_observation('9d000000-0000-0000-0000-0000000000a1') id;
select ok(st_equals((select geom from work_order where id = (select id from w9)), (select bed_pt from tg)), 'its work order is placed at the bed');

-- Curator and manager see the exact point
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000004');
set local role authenticated;
select ok(st_equals(asset_geom((select sens from tg)), (select exact from tg)), 'curator: exact point');
select ok(st_equals(observation_geom('9d000000-0000-0000-0000-0000000000a1'), (select exact from tg)), 'curator: exact sighting');
reset role;
select pg_temp.as_user((select m.user_id::text from membership m where m.organisation_id = (select org from tg)
                         and 'manager' = any(m.roles) limit 1));
set local role authenticated;
select is((asset_detail((select sens from tg)) ->> 'position_hidden')::boolean, false, 'manager: not hidden');

select * from finish();
rollback;
