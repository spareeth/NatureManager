-- Task 1.2: map read functions return only the caller's organisation data.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temp table tg as
  select s.id as site, s.organisation_id as org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated, anon;

-- Three Terra assets: two inside bed WG-07 area, one far east of the site.
insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
select org, site, (select id from asset_type where organisation_id = org and code = v.type), v.tag,
       site_from_local(site, v.x, v.y), v.status::asset_status
from tg, (values ('TREE', 'MAP-T01', 50.0, 50.0, 'planted'), ('VALVE', 'MAP-V01', 52.0, 51.0, 'active'),
                 ('TREE', 'MAP-T02', 400.0, 50.0, 'planted')) v(type, tag, x, y, status);

-- Second organisation and user.
insert into auth.users (id, email) values ('30000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('cccccccc-0000-0000-0000-000000000000', 'Other', 'other');
insert into membership (organisation_id, user_id, roles, display_name)
values ('cccccccc-0000-0000-0000-000000000000', '30000000-0000-0000-0000-00000000000b', '{manager}', 'Other Mgr');

-- As Terra manager -----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select map_site(site) ->> 'code' from tg), 'TG', 'map_site returns the site');
select ok((select (map_site(site) ->> 'has_grid')::boolean and jsonb_array_length(map_site(site) -> 'bbox') = 4 from tg),
  'map_site has grid flag and a 4-number bbox');
select is((select map_site(site) -> 'boundary' ->> 'type' from tg), 'MultiPolygon', 'boundary is GeoJSON');

select is((select jsonb_array_length(map_locations(site) -> 'features') from tg), 52, 'map_locations: 48 beds + 4 zones');
select is(
  (select count(*)::int from tg, jsonb_array_elements(map_locations(tg.site) -> 'features') f
   where f -> 'properties' ->> 'kind' = 'bed'
     and left(f -> 'properties' ->> 'code', 2) <> f -> 'properties' ->> 'zone_code'), 0,
  'every bed carries the zone code of its prefix');

select is(
  (select jsonb_agg(r -> 2 order by r ->> 2)
   from tg, jsonb_array_elements(map_assets(tg.site, 55.1532, 24.9579, 55.1556, 24.9600) -> 'rows') r
   where r ->> 2 like 'MAP-%'),
  '["MAP-T01", "MAP-V01"]'::jsonb, 'map_assets returns assets inside the bbox only');
select results_eq(
  $$select jsonb_array_length(m -> 'rows'), (m ->> 'truncated')::boolean
    from tg, map_assets(tg.site, 55.1532, 24.9579, 55.1556, 24.9600, 1) m$$,
  $$values (1, true)$$, 'map_assets respects p_limit and reports truncation');
select ok(
  (select r -> 4 = '"built"' and r -> 3 = '"active"' and jsonb_typeof(r -> 0) = 'number'
   from tg, jsonb_array_elements(map_assets(tg.site, 55.1532, 24.9579, 55.1556, 24.9600) -> 'rows') r
   where r ->> 2 = 'MAP-V01'),
  'rows are [lon, lat, tag, status, class]');
select results_eq(
  $$select d ->> 'type_code', (d ->> 'local_x')::numeric, (d ->> 'local_y')::numeric
    from tg, map_asset_detail(tg.site, 'MAP-V01') d$$,
  $$values ('VALVE'::text, 52.00::numeric, 51.00::numeric)$$, 'map_asset_detail returns the clicked asset');

select results_eq(
  $$select x, y from tg, site_local_xy(tg.site, 55.15449, 24.95875)$$,
  $$select round(st_x(g)::numeric, 2), round(st_y(g)::numeric, 2)
    from tg, site_to_local(tg.site, st_setsrid(st_makepoint(55.15449, 24.95875), 4326)) g$$,
  'site_local_xy equals site_to_local, to the centimetre');

-- As the other organisation ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select map_site(site) from tg), null, 'other organisation: map_site is null');
select is((select jsonb_array_length(map_locations(site) -> 'features') from tg), 0, 'other organisation: no locations');
select is((select jsonb_array_length(map_assets(site, -180, -90, 180, 90) -> 'rows') from tg), 0,
  'other organisation: no assets');
select is((select map_asset_detail(site, 'MAP-V01') from tg), null, 'other organisation: no asset detail');
select is((select count(*)::int from tg, site_local_xy(tg.site, 55.15449, 24.95875)), 0,
  'other organisation: no grid transform for Terra''s site');

-- Anonymous cannot call the map functions at all.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select map_locations('00000000-0000-0000-0000-000000000000')$$, '42501', null,
  'anon cannot execute map functions');

select * from finish();
rollback;
