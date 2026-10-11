-- Task 1.1: Terra Garden beds and zones seeded from TG_beds_new.geojson.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temp view tg_loc as
  select l.* from location l join site s on s.id = l.site_id
  join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';

select results_eq($$select kind::text, count(*)::int from tg_loc group by 1 order by 1$$,
  $$values ('bed'::text, 48), ('zone', 4)$$, '48 beds and 4 zones');

select results_eq(
  $$select z.code, z.name, count(b.id)::int from tg_loc z left join tg_loc b on b.parent_id = z.id
    where z.kind = 'zone' group by z.code, z.name order by z.code$$,
  $$values ('EG'::text, 'East Garden'::text, 12), ('NG', 'North Garden', 15),
           ('SG', 'South Garden', 11), ('WG', 'West Garden', 10)$$,
  'zones EG 12, NG 15, SG 11, WG 10 beds');

select is((select count(*)::int from tg_loc b join tg_loc z on z.id = b.parent_id
           where b.kind = 'bed' and left(b.code, 2) <> z.code), 0, 'every bed sits under the zone of its prefix');
select is((select count(*)::int from tg_loc where kind = 'bed' and parent_id is null), 0, 'no orphan beds');
select is((select count(*)::int from tg_loc where kind = 'bed' and code !~ '^(EG|NG|SG|WG)-[0-9]{2}$'), 0,
  'bed codes follow ZZ-NN');

-- Areas from data/gis/README.md (EPSG:3997): EG 2,170, NG 1,433, SG 1,163, WG 1,509; total 6,275.
select results_eq(
  $$select code, round(st_area(st_transform(geom, 3997)))::int from tg_loc where kind = 'zone' order by code$$,
  $$values ('EG'::text, 2170), ('NG', 1433), ('SG', 1163), ('WG', 1509)$$,
  'zone areas match data/gis/README.md (EPSG:3997)');
select is((select round(sum(st_area(st_transform(geom, 3997))))::int from tg_loc where kind = 'bed'), 6275,
  'total bed area 6,275 m2');
select ok((select bool_and(abs(area_m2 - st_area(st_transform(geom, 3997))) < 1) from tg_loc),
  'area_m2 (geography) agrees with EPSG:3997 within 1 m2');

select is((select count(*)::int from tg_loc where kind = 'bed'
           and not st_covers((select st_buffer(boundary::geography, 0.01)::geometry from site where code = 'TG'
                              and organisation_id = (select id from organisation where slug = 'terra')), geom)), 0,
  'every bed lies inside the site boundary');

-- A point inside bed WG-07 resolves to the bed, not the zone.
select is(
  (select code from location where id = resolve_location(
     (select st_pointonsurface(geom) from tg_loc where code = 'WG-07'),
     (select id from site where code = 'TG' and organisation_id = (select id from organisation where slug = 'terra')))),
  'WG-07', 'resolve_location picks the bed inside its zone');

select * from finish();
rollback;
