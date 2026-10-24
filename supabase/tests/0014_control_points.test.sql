-- Task 1.8: control points, residuals, coordinate entry, offsets and move by offset.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log; delete from control_point;

create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated, anon;

-- Conversions -----------------------------------------------------------------------------
select is((select site_point(site, 'grid', 100, 100) ->> 'e' from tg), '481908.000', 'grid 100,100 is E origin + 100');
select is((select site_point(site, 'grid', 100, 100) ->> 'n' from tg), '2761499.000', 'grid 100,100 is N origin + 100');
select ok((select abs((site_point(site, 'dltm', 481908, 2761499) ->> 'x')::numeric - 100) < 0.001
                  and abs((site_point(site, 'wgs84', (site_point(site, 'grid', 12.5, 40) ->> 'lon')::float8,
                                      (site_point(site, 'grid', 12.5, 40) ->> 'lat')::float8) ->> 'y')::numeric - 40) < 0.001 from tg),
  'Dubai TM and WGS 84 entry give the same grid position');
select is((select site_point(site, 'feet', 1, 2) from tg), null, 'unknown coordinate system gives null');

-- Whole-geometry inverse and offsets ----------------------------------------------------------
select ok((select max(st_distance(st_transform(geom, 3997), st_transform(site_geom_from_local(site, site_to_local(site, geom)), 3997))) < 0.001
           from location, tg where kind = 'bed'), 'site_geom_from_local inverts site_to_local for every bed polygon (< 1 mm)');
select ok((select abs(st_distance(st_transform(g, 3997), st_transform(site_offset_geom(site, g, 3, 4), 3997)) - 5) < 0.001
           from tg, (select site_from_local((select site from tg), 50, 50) g) p), 'offset (3, 4) moves a point 5 m');

-- On a grid rotated 90 degrees, +x on the grid is +N on the map.
update site set grid_rotation_deg = 90 where id = (select site from tg);
select ok((select abs(st_y(st_transform(site_offset_geom(site, g, 10, 0), 3997)) - st_y(st_transform(g, 3997)) - 10) < 0.001
           from tg, (select st_setsrid(st_makepoint(55.1544, 24.9587), 4326) g) p), 'offsets follow the grid axes, not the map axes');
update site set grid_rotation_deg = 0 where id = (select site from tg);

-- Bed corner snapping ----------------------------------------------------------------------
create temp table v as select (st_dumppoints(geom)).geom g from location where code = 'WG-07' limit 1;
grant select on v to authenticated;
select is((select nearest_bed_corner(site, st_x(g) + 0.000005, st_y(g)) ->> 'code' from tg, v), 'WG-07', 'click 0.5 m from a corner snaps to it');
select is((select nearest_bed_corner(site, 55.10, 24.90) from tg), null, 'far from every bed: no corner');

-- Control points and residuals ----------------------------------------------------------------
insert into control_point (organisation_id, site_id, code, geom, source, accuracy_m, ref_x, ref_y, ref_source)
select org, site, v.code, site_from_local(site, v.x, v.y), 'rtk', 0.02, v.rx, v.ry, case when v.rx is null then null else 'plan' end
from tg, (values ('CP-01', 10.0, 10.0, 10.0, 10.03), ('CP-02', 200.0, 20.0, 200.04, 20.0), ('CP-03', 100.0, 200.0, null, null)) v(code, x, y, rx, ry);
select throws_ok($$insert into control_point (organisation_id, site_id, code, geom, source, ref_x)
                   select org, site, 'CP-09', site_from_local(site, 1, 1), 'rtk', 5 from tg$$,
  '23514', null, 'reference needs both x and y');
select results_eq($$select r ->> 'code', (r ->> 'residual_m')::numeric from tg, jsonb_array_elements(control_point_list(tg.site) -> 'rows') r order by 1$$,
  $$values ('CP-01'::text, 0.030::numeric), ('CP-02', 0.040), ('CP-03', null)$$, 'residual per control point');
select results_eq($$select (l ->> 'with_reference')::int, (l ->> 'rmse_m')::numeric, (l ->> 'max_m')::numeric from tg, control_point_list(tg.site) l$$,
  $$values (2, 0.035::numeric, 0.040::numeric)$$, 'RMSE and largest residual');

-- Move by offset ----------------------------------------------------------------------------------
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status)
select 'c0000000-0000-0000-0000-0000000000a1'::uuid, org, site, (select id from asset_type where organisation_id = org and code = 'TREE'),
       'WG07-T01_TST', site_from_local(site, 120, 200), 'established'::asset_status from tg
union all
select 'c0000000-0000-0000-0000-0000000000a2'::uuid, org, site, (select id from asset_type where organisation_id = org and code = 'GROUP'),
       'WG07-G01_TST', site_geom_from_local(site, st_makeenvelope(118, 198, 122, 202)), 'planted'::asset_status from tg;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select asset_move_offset('c0000000-0000-0000-0000-0000000000a1', 1.5, -2, 0.05) ->> 'local_x'), '121.50',
  'green team moves a tree by offset; grid x updated');
select results_eq($$select position_source, position_accuracy_m, local_y from asset where id = 'c0000000-0000-0000-0000-0000000000a1'$$,
  $$values ('offset'::text, 0.05::numeric, 198.00::numeric(10,2))$$, 'position source offset and accuracy recorded');
select lives_ok($$select asset_move_offset('c0000000-0000-0000-0000-0000000000a2', 3, 0)$$, 'a planting group polygon moves too');
select ok((select st_npoints(geom) = 5 and abs(st_area(st_transform(geom, 3997)) - 16) < 0.01 and local_x = 123.00
           from asset where id = 'c0000000-0000-0000-0000-0000000000a2'), 'the polygon keeps its shape and size');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select asset_move_offset('c0000000-0000-0000-0000-0000000000a1', 1, 1)$$, 'P0002', null,
  'owner (read-only) cannot move assets');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
delete from control_point where code = 'CP-03';
reset role;
select is((select count(*)::int from control_point), 2, 'field manager deletes a control point');

select * from finish();
rollback;
