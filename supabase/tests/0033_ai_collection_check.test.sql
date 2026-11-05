begin;
select plan(4);

-- A living asset with a taxon, its location and point.
select a.id as asset_id, a.taxon_id, a.location_id, a.organisation_id,
       st_x(st_centroid(a.geom)) as lon, st_y(st_centroid(a.geom)) as lat
  into temp t from asset a
 where a.taxon_id is not null and a.location_id is not null
   and a.status::text not in ('planned', 'dead', 'removed', 'disposed')
 limit 1;
grant select on t to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select m.user_id from membership m join t on m.organisation_id = t.organisation_id limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;

select is((select in_collection from ai_collection_check((select organisation_id from t), array[(select taxon_id from t)],
           (select location_id from t))), true, 'in its bed: in the collection');
select is((select in_collection from ai_collection_check((select organisation_id from t), array[(select taxon_id from t)],
           null, (select lon from t), (select lat from t) + 0.0001, 25)), true, 'about 11 m away: within 25 m');
select is((select in_collection from ai_collection_check((select organisation_id from t), array[(select taxon_id from t)],
           null, (select lon from t), (select lat from t) + 0.01, 25)), false, 'about 1.1 km away: not');

-- Another organisation's member sees nothing of it.
reset role;
insert into organisation (id, name, slug) values ('00000000-0000-0000-0000-00000000bbbb', 'Other org', 'other-org-0033');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000bb', 'b@other.test');
insert into membership (organisation_id, user_id, roles, display_name)
  values ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000bb', '{manager}', 'Mgr B');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
set local role authenticated;
select is((select in_collection from ai_collection_check((select organisation_id from t), array[(select taxon_id from t)],
           (select location_id from t))), false, 'other organisation: not visible');

select * from finish();
rollback;
