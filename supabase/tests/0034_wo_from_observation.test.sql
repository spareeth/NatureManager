-- Task 3.5: work order from an observation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
create temp table tg as select s.id site, s.organisation_id org,
  (select id from location l where l.organisation_id = s.organisation_id and l.code = 'NG-02') bed,
  (select a.id from asset a join location l on l.id = a.location_id where l.code = 'NG-02' limit 1) asset
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
delete from media where work_order_id is not null;
delete from work_order_asset;

-- Green One sees pests on a tree in NG-02, with a photo
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
insert into observation (id, organisation_id, site_id, obs_type, geom, asset_id, severity, notes)
select '9c000000-0000-0000-0000-0000000000a1', org, site, 'pest_disease', (select st_pointonsurface(geom) from location where id = bed),
       asset, 4, 'Aphids on new shoots' from tg;
insert into media (id, organisation_id, bucket, path, kind, observation_id)
select '9c000000-0000-0000-0000-0000000000b1', org, 'photos', org || '/obs/9c000000-0000-0000-0000-0000000000a1/p.jpg', 'photo',
       '9c000000-0000-0000-0000-0000000000a1' from tg;

create temp table w1 as select wo_from_observation('9c000000-0000-0000-0000-0000000000a1') id;
select results_eq($$select source, source_ref, wo_type, status::text, priority, title, description from work_order where id = (select id from w1)$$,
  $$values ('observation'::text, '9c000000-0000-0000-0000-0000000000a1'::uuid, 'reactive'::text, 'requested'::text, 'P2'::text,
            'Pest or disease in NG-02'::text, 'Aphids on new shoots'::text)$$,
  'a requested reactive work order, priority from severity 4, title from the type and bed, notes as description');
select is((select location_id from work_order where id = (select id from w1)), (select bed from tg), 'at the observation''s bed');
select ok((select st_equals(w.geom, observation_geom(o.id)) from work_order w, observation o where w.id = (select id from w1)
           and o.id = '9c000000-0000-0000-0000-0000000000a1'), 'at the observation''s point');
select is((select asset_id from work_order_asset where work_order_id = (select id from w1)), (select asset from tg), 'linked to the asset');
select is((select path from media where work_order_id = (select id from w1)),
          (select path from media where id = '9c000000-0000-0000-0000-0000000000b1'), 'the photo is listed on the work order');
select is(wo_from_observation('9c000000-0000-0000-0000-0000000000a1'), (select id from w1), 'a second tap returns the open work order');
select is((select count(*)::int from work_order where source_ref = '9c000000-0000-0000-0000-0000000000a1'), 1, 'only one');

-- Offline replay with a client uuid, own title and priority, on a new observation
insert into observation (id, organisation_id, site_id, obs_type, geom, notes)
select '9c000000-0000-0000-0000-0000000000a2', org, site, 'plant_health', (select st_pointonsurface(geom) from location where id = bed), null from tg;
select is(wo_from_observation('9c000000-0000-0000-0000-0000000000a2', 'Dead branch', 'P1', '9c000000-0000-0000-0000-0000000000c1'),
          wo_from_observation('9c000000-0000-0000-0000-0000000000a2', 'Dead branch', 'P1', '9c000000-0000-0000-0000-0000000000c1'),
          'a replay with the same client uuid adds nothing');
select results_eq($$select title, priority from work_order where client_uuid = '9c000000-0000-0000-0000-0000000000c1'$$,
  $$values ('Dead branch'::text, 'P1'::text)$$, 'own title and priority');
select ok(exists(select 1 from jsonb_array_elements(field_requests((select site from tg)) -> 'mine') m
                 where (m ->> 'id')::uuid = (select id from w1)), 'listed under Mine in the field app');

-- Another organisation's member cannot see the observation
reset role;
insert into organisation (id, name, slug) values ('9c000000-0000-0000-0000-00000000bbbb', 'Other', 'other-0034');
insert into auth.users (id, email) values ('9c000000-0000-0000-0000-0000000000bb', 'b@0034.test');
insert into membership (organisation_id, user_id, roles, display_name)
  values ('9c000000-0000-0000-0000-00000000bbbb', '9c000000-0000-0000-0000-0000000000bb', '{manager}', 'B');
select pg_temp.as_user('9c000000-0000-0000-0000-0000000000bb');
set local role authenticated;
select throws_ok($$select wo_from_observation('9c000000-0000-0000-0000-0000000000a1')$$, 'P0002', null,
  'another organisation cannot raise work from it');

select * from finish();
rollback;
