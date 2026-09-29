-- Task 0.3: site grid round trip, resolve_location, spatial RLS. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Fixtures (as postgres) --------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mgr_a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'green_a@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'fm_a@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'mgr_b@test.local');
insert into organisation (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into membership (organisation_id, user_id, roles, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', '{manager}', 'Mgr A'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', '{green_team}', 'Green A'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', '{field_manager}', 'FM A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', '{manager}', 'Mgr B');

-- Terra Garden boundary from data/gis/TG_boundary.geojson (CRS84).
create temp table tg as select st_setsrid(st_geomfromgeojson('{"type":"MultiPolygon","coordinates":[[[[55.1550427151,24.9579634151],[55.1546558059,24.9579644853],[55.1545926589,24.9579634151],[55.154165614,24.95798161],[55.1539365723,24.9580201403],[55.1537118118,24.9580864982],[55.1535630418,24.9581389423],[55.1534249746,24.9582031596],[55.1532911886,24.9582764743],[55.1533425624,24.9583578162],[55.1534035689,24.9584530719],[55.1534945433,24.9585964905],[55.153664184,24.9588327566],[55.153748071,24.958952792],[55.1538761011,24.9591329724],[55.1539467401,24.95923572],[55.1540200548,24.9593443543],[55.1540735692,24.9594182042],[55.154124943,24.9594909838],[55.1541811332,24.9595739311],[55.1542367881,24.9596531324],[55.1542817402,24.9597194903],[55.1543240166,24.9597882563],[55.1543743202,24.9598621062],[55.1544203426,24.9599338155],[55.1544470998,24.9599316749],[55.1545723235,24.9598535438],[55.1547622996,24.9597119982],[55.1548361495,24.9596467107],[55.1549121399,24.9595803528],[55.1550207742,24.9594535237],[55.1551096081,24.959350776],[55.15519095,24.9592389309],[55.155261589,24.9591297615],[55.1553225954,24.9590254084],[55.1553825316,24.9589248013],[55.1554242728,24.9588573732],[55.1554940837,24.9587393516],[55.155529161,24.9586724809],[55.1555302313,24.9585954202],[55.1554485964,24.9584629287],[55.1553300874,24.9582914584],[55.1552396481,24.9581699807],[55.1551732902,24.9580768656],[55.1551187055,24.9580019454],[55.1550427151,24.9579634151]]]]}'), 4326) as boundary;
grant select on tg to authenticated;

-- A: proposed TG grid (COORDINATES.md): origin E 481808, N 2761399, rotation 0, scale 1.
-- R: same boundary with a rotated, scaled grid to exercise every term of the transform.
-- N: grid rotated 90 degrees, to pin down the rotation direction.
-- B: another organisation.
insert into site (id, organisation_id, code, name, site_type, boundary,
                  grid_origin_e, grid_origin_n, grid_rotation_deg, grid_scale)
select v.id::uuid, v.org::uuid, v.code, v.code, 'botanical_garden', tg.boundary, 481808, 2761399, v.rot, v.scale
from tg, (values
  ('aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-000000000000', 'TG', 0.0, 1.0),
  ('aaaaaaaa-0000-0000-0000-00000000a002', 'aaaaaaaa-0000-0000-0000-000000000000', 'TGR', 23.7, 1.0005),
  ('aaaaaaaa-0000-0000-0000-00000000a003', 'aaaaaaaa-0000-0000-0000-000000000000', 'TGN', 90.0, 1.0),
  ('bbbbbbbb-0000-0000-0000-00000000b001', 'bbbbbbbb-0000-0000-0000-000000000000', 'BX', 0.0, 1.0)
) v(id, org, code, rot, scale);

-- Grid transforms ------------------------------------------------------------------
select is(
  (select st_srid(site_to_local('aaaaaaaa-0000-0000-0000-00000000a001', boundary)) from tg), 0,
  'site_to_local returns SRID 0');

select ok(
  (select st_x(g) = 0 and st_y(g) = 0
   from (select site_to_local('aaaaaaaa-0000-0000-0000-00000000a001',
                              st_setsrid(st_makepoint(481808, 2761399), 3997)) g) t),
  'grid origin maps to local 0, 0');

select ok(
  (select st_xmin(e) >= 0 and st_ymin(e) >= 0 and abs(st_xmax(e) - 237) < 3 and abs(st_ymax(e) - 229) < 3
   from (select site_to_local('aaaaaaaa-0000-0000-0000-00000000a001', boundary)::box2d e from tg) t),
  'garden spans about x 0..237 m, y 0..229 m (COORDINATES.md)');

select ok(
  (select abs(st_x(g) - 10) < 1e-6 and abs(st_y(g)) < 1e-6
   from (select site_to_local('aaaaaaaa-0000-0000-0000-00000000a003',
                              st_setsrid(st_makepoint(481808, 2761409), 3997)) g) t),
  'rotation is counter-clockwise: with 90 degrees, 10 m north of origin is local x 10, y 0');

-- Round trip, 1,000 random points inside the real boundary, error under 1 mm.
create temp table pts as
  select (st_dump(st_generatepoints(boundary, 1000, 42))).geom as g from tg;
select is((select count(*)::int from pts), 1000, '1,000 random points generated');

select cmp_ok(
  (select max(st_distance(st_transform(g, 3997), st_transform(
            site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', st_x(l), st_y(l)), 3997)))
   from (select g, site_to_local('aaaaaaaa-0000-0000-0000-00000000a001', g) l from pts) t),
  '<', 0.001::float8, 'round trip error under 1 mm, rotation 0');

select cmp_ok(
  (select max(st_distance(st_transform(g, 3997), st_transform(
            site_from_local('aaaaaaaa-0000-0000-0000-00000000a002', st_x(l), st_y(l)), 3997)))
   from (select g, site_to_local('aaaaaaaa-0000-0000-0000-00000000a002', g) l from pts) t),
  '<', 0.001::float8, 'round trip error under 1 mm, rotation 23.7 and scale 1.0005');

select ok(
  (select abs(st_distance(site_to_local('aaaaaaaa-0000-0000-0000-00000000a002', st_transform(a, 3997)),
                          site_to_local('aaaaaaaa-0000-0000-0000-00000000a002', st_transform(b, 3997)))
              * 1.0005 - st_distance(st_transform(a, 3997), st_transform(b, 3997))) < 1e-6
   from (select (select g from pts limit 1) a, (select g from pts offset 1 limit 1) b) t),
  'grid_scale divides distances as documented');

-- Locations and resolve_location --------------------------------------------------
-- Zone = whole boundary; bed = 20 m square inside it at local (100..120, 100..120).
insert into location (id, organisation_id, site_id, kind, code, name, geom)
select 'aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-000000000000',
       'aaaaaaaa-0000-0000-0000-00000000a001', 'zone', 'EG', 'East Garden', boundary from tg;
insert into location (id, organisation_id, site_id, parent_id, kind, code, name, geom)
select 'aaaaaaaa-0000-0000-0000-00000000c002', 'aaaaaaaa-0000-0000-0000-000000000000',
       'aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-00000000c001', 'bed', 'EG-01', 'Bed EG-01',
       st_multi(st_makepolygon(st_makeline(array[
         site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 100, 100),
         site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 120, 100),
         site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 120, 120),
         site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 100, 120),
         site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 100, 100)])));
insert into location (id, organisation_id, site_id, kind, code, name, geom)
select 'bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-000000000000',
       'bbbbbbbb-0000-0000-0000-00000000b001', 'zone', 'BZ', 'B zone', boundary from tg;

select ok((select abs(area_m2 - 400) < 1 from location where code = 'EG-01'), 'area_m2 of a 20 m square is 400 m2');

select is(resolve_location(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 110, 110),
                           'aaaaaaaa-0000-0000-0000-00000000a001'),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'point in bed resolves to the bed, not the zone');
select is(resolve_location(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 110, 130),
                           'aaaaaaaa-0000-0000-0000-00000000a001'),
  'aaaaaaaa-0000-0000-0000-00000000c001'::uuid, 'point outside beds resolves to the zone');
select is(resolve_location(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', -500, -500),
                           'aaaaaaaa-0000-0000-0000-00000000a001'),
  null::uuid, 'point outside the site resolves to null');
select is(resolve_location(st_buffer(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 110, 110), 0.00001)),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'polygon input resolves by a point on its surface');
select is(resolve_location(st_transform(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 110, 110), 3997),
                           'aaaaaaaa-0000-0000-0000-00000000a001'),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'input in EPSG:3997 is accepted');

select throws_ok(
  $$insert into location (organisation_id, site_id, parent_id, kind, code, name, geom)
    select 'bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000b001',
           'aaaaaaaa-0000-0000-0000-00000000c001', 'bed', 'BX-01', 'x', boundary from tg$$,
  '23503', null, 'location parent must be in the same site');
select throws_ok(
  $$insert into location (organisation_id, site_id, kind, code, name, geom)
    select 'aaaaaaaa-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000b001',
           'zone', 'XX', 'x', boundary from tg$$,
  '23503', null, 'location cannot use another organisation''s site');
select is((select count(*)::int from audit_log where table_name = 'location'), 3, 'location inserts are audited');

-- RLS as manager of org A ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from site), 3, 'A sees only its own sites');
select is((select count(*)::int from location), 2, 'A sees only its own locations');
select is(site_to_local('bbbbbbbb-0000-0000-0000-00000000b001', (select boundary from tg)), null,
  'site_to_local on another organisation''s site returns null');
select is(resolve_location(site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 110, 130)),
  'aaaaaaaa-0000-0000-0000-00000000c001'::uuid, 'resolve_location ignores org B locations under RLS');

-- Green team cannot edit locations; field manager can.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok(
  $$insert into control_point (organisation_id, site_id, code, geom, source)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001', 'CP-01',
            site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 5, 5), 'rtk')$$,
  '42501', null, 'green team cannot add control points');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select lives_ok(
  $$insert into control_point (organisation_id, site_id, code, geom, source)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001', 'CP-01',
            site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', 5, 5), 'rtk')$$,
  'field manager adds a control point');
update site set grid_rotation_deg = 5 where code = 'TG';
reset role;
select is((select grid_rotation_deg from site where id = 'aaaaaaaa-0000-0000-0000-00000000a001'), 0::float8,
  'field manager update of the site grid had no effect');

select * from finish();
rollback;
