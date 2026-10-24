-- Task 0.4: taxonomy, assets, status history, media, storage RLS. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Start from the seed alone, even when the local database also holds migrated Hortis data.
-- Rolled back with the rest of the test.
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log;

-- Fixtures (as postgres) --------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mgr_a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'green_a@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'curator_a@test.local'),
  ('00000000-0000-0000-0000-00000000000f', 'owner_a@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'mgr_b@test.local');
insert into organisation (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');
insert into membership (organisation_id, user_id, roles, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', '{manager}', 'Mgr A'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', '{green_team}', 'Green A'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000e', '{curator}', 'Curator A'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000f', '{owner}', 'Owner A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', '{manager}', 'Mgr B');

-- Sites: 240 m square from the proposed TG grid origin (EPSG:3997), grid rotation 0.
insert into site (id, organisation_id, code, name, site_type, boundary, grid_origin_e, grid_origin_n)
select v.id::uuid, v.org::uuid, v.code, v.code, 'botanical_garden',
       st_multi(st_transform(st_makeenvelope(481808, 2761399, 482048, 2761639, 3997), 4326)),
       481808, 2761399
from (values ('aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-000000000000', 'TG'),
             ('bbbbbbbb-0000-0000-0000-00000000b001', 'bbbbbbbb-0000-0000-0000-000000000000', 'BX')) v(id, org, code);

create function pg_temp.lp(x float8, y float8) returns geometry language sql as
  $$ select site_from_local('aaaaaaaa-0000-0000-0000-00000000a001', x, y) $$;
create function pg_temp.lsq(x0 float8, y0 float8, x1 float8, y1 float8) returns geometry language sql as
  $$ select st_multi(st_makepolygon(st_makeline(array[pg_temp.lp(x0, y0), pg_temp.lp(x1, y0),
       pg_temp.lp(x1, y1), pg_temp.lp(x0, y1), pg_temp.lp(x0, y0)]))) $$;

insert into location (id, organisation_id, site_id, kind, code, name, geom) values
  ('aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'zone', 'WG', 'West Garden', pg_temp.lsq(0, 0, 240, 240)),
  ('aaaaaaaa-0000-0000-0000-00000000c002', 'aaaaaaaa-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'bed', 'WG-07', 'Bed WG-07', pg_temp.lsq(100, 100, 120, 120)),
  ('aaaaaaaa-0000-0000-0000-00000000c003', 'aaaaaaaa-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'bed', 'WG-08', 'Bed WG-08', pg_temp.lsq(150, 150, 170, 170));

insert into taxon (id, kingdom, family, genus, specific_epithet, scientific_name, authorship, rank, common_names) values
  ('aaaaaaaa-0000-0000-0000-00000000d001', 'Plantae', 'Fabaceae', 'Prosopis', 'cineraria',
   'Prosopis cineraria', '(L.) Druce', 'species', '{"en": ["Ghaf"], "ar": ["غاف"]}');

insert into asset_type (id, organisation_id, asset_class, code, name) values
  ('aaaaaaaa-0000-0000-0000-00000000e001', 'aaaaaaaa-0000-0000-0000-000000000000', 'living', 'TREE', 'Tree'),
  ('aaaaaaaa-0000-0000-0000-00000000e002', 'aaaaaaaa-0000-0000-0000-000000000000', 'built', 'VALVE', 'Valve'),
  ('bbbbbbbb-0000-0000-0000-00000000e001', 'bbbbbbbb-0000-0000-0000-000000000000', 'living', 'TREE', 'Tree');

insert into accession (id, organisation_id, accession_number, taxon_id, provenance_type) values
  ('aaaaaaaa-0000-0000-0000-00000000f001', 'aaaaaaaa-0000-0000-0000-000000000000', 'TG-2026-0001',
   'aaaaaaaa-0000-0000-0000-00000000d001', 'G');

-- Class and status rules -----------------------------------------------------------
select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T99_PRO', pg_temp.lp(110, 110), 'active')$$,
  '23514', null, 'living asset cannot be active (built lifecycle)');
select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e002', 'WG07-VLV99', pg_temp.lp(110, 110), 'planted')$$,
  '23514', null, 'built asset cannot be planted (living lifecycle)');

-- Position triggers -----------------------------------------------------------------
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id, accession_id, position_source)
values ('aaaaaaaa-0000-0000-0000-0000000a0001', 'aaaaaaaa-0000-0000-0000-000000000000',
        'aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T04_PRO',
        pg_temp.lp(110.004, 109.996), 'planted', 'aaaaaaaa-0000-0000-0000-00000000d001',
        'aaaaaaaa-0000-0000-0000-00000000f001', 'rtk');

select results_eq($$select local_x, local_y from asset where tag_code = 'WG07-T04_PRO'$$,
  $$values (110.00::numeric(10,2), 110.00::numeric(10,2))$$, 'local_x, local_y set from site grid, 2 decimals');
select is((select location_id from asset where tag_code = 'WG07-T04_PRO'),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'location_id resolved to the bed');

update asset set geom = pg_temp.lp(160, 161) where tag_code = 'WG07-T04_PRO';
select results_eq($$select local_x, local_y, location_id from asset where tag_code = 'WG07-T04_PRO'$$,
  $$values (160.00::numeric(10,2), 161.00::numeric(10,2), 'aaaaaaaa-0000-0000-0000-00000000c003'::uuid)$$,
  'moving geom recomputes local x, y and location');

-- Hortis case: the record names its bed but the point is just outside it; keep the named bed.
insert into asset (organisation_id, site_id, location_id, asset_type_id, tag_code, geom, status)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
        'aaaaaaaa-0000-0000-0000-00000000c002', 'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T05_PRO',
        pg_temp.lp(121, 110), 'established');
select is((select location_id from asset where tag_code = 'WG07-T05_PRO'),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'explicit location_id is kept on insert');
update asset set location_id = 'aaaaaaaa-0000-0000-0000-00000000c003', geom = pg_temp.lp(122, 110)
  where tag_code = 'WG07-T05_PRO';
select is((select location_id from asset where tag_code = 'WG07-T05_PRO'),
  'aaaaaaaa-0000-0000-0000-00000000c003'::uuid, 'explicit location_id change is kept on update');

insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
        'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-G01_PRO', pg_temp.lsq(102, 102, 106, 108), 'planted');
select results_eq($$select local_x, local_y, location_id from asset where tag_code = 'WG07-G01_PRO'$$,
  $$values (104.00::numeric(10,2), 105.00::numeric(10,2), 'aaaaaaaa-0000-0000-0000-00000000c002'::uuid)$$,
  'polygon asset uses its centroid');

select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T04_PRO', pg_temp.lp(1, 1), 'planted')$$,
  '23505', null, 'tag_code is unique per organisation');
select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e001', 'X-LINE', st_makeline(pg_temp.lp(1, 1), pg_temp.lp(2, 2)), 'planted')$$,
  '23514', null, 'asset geometry must be a point or polygon');

-- Cross-organisation references --------------------------------------------------------
select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'bbbbbbbb-0000-0000-0000-00000000e001', 'WG07-T98_PRO', pg_temp.lp(1, 1), 'planted')$$,
  '23503', null, 'asset cannot use another organisation''s asset type');
select throws_ok(
  $$insert into asset (organisation_id, site_id, location_id, asset_type_id, tag_code, geom, status)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-00000000b001',
            'aaaaaaaa-0000-0000-0000-00000000c002', 'bbbbbbbb-0000-0000-0000-00000000e001', 'B-1',
            pg_temp.lp(1, 1), 'planted')$$,
  '23503', null, 'asset cannot use a location from another site');
select throws_ok(
  $$insert into media (organisation_id, bucket, path, kind)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'photos', 'bbbbbbbb-0000-0000-0000-000000000000/x.jpg', 'photo')$$,
  '23514', null, 'media path must start with its organisation id');

-- Status history ------------------------------------------------------------------------
select asset_set_status('aaaaaaaa-0000-0000-0000-0000000a0001', 'declining', 'Leaf scorch after heatwave');
select results_eq(
  $$select from_status::text, to_status::text, reason from asset_status_change
    where asset_id = 'aaaaaaaa-0000-0000-0000-0000000a0001' order by changed_at, from_status nulls first$$,
  $$values (null::text, 'planted'::text, null::text), ('planted', 'declining', 'Leaf scorch after heatwave')$$,
  'initial status and asset_set_status change are recorded with reason');
update asset set status = 'dead' where id = 'aaaaaaaa-0000-0000-0000-0000000a0001';
select is((select reason from asset_status_change where to_status = 'dead'), null,
  'reason does not leak into later changes');

-- Audit (DATA_MODEL section 9) ----------------------------------------------------------
insert into org_taxon (organisation_id, taxon_id, inhouse_code, iucn_category, origin)
values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000d001', 'PRO', 'LC', 'native');
select is((select row_id from audit_log where table_name = 'org_taxon'),
  'aaaaaaaa-0000-0000-0000-00000000d001'::uuid, 'org_taxon audit rows keyed by taxon_id');
select ok((select count(*) > 0 from audit_log where table_name = 'asset'), 'asset changes are audited');

-- RLS: green team of A -----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T06_PRO', pg_temp.lp(111, 111), 'planted')$$,
  'green team adds an asset');
select is((select location_id from asset where tag_code = 'WG07-T06_PRO'),
  'aaaaaaaa-0000-0000-0000-00000000c002'::uuid, 'location resolves under RLS');
update org_taxon set iucn_category = 'CR' where inhouse_code = 'PRO';  -- silently blocked by RLS
select throws_ok(
  $$insert into taxon (kingdom, scientific_name, rank) values ('Plantae', 'Ziziphus spina-christi', 'species')$$,
  '42501', null, 'green team cannot add shared taxa');
select throws_ok(
  $$insert into asset_status_change (organisation_id, asset_id, to_status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000a0001', 'removed')$$,
  '42501', null, 'clients cannot write status history directly');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('photos', 'aaaaaaaa-0000-0000-0000-000000000000/t04.jpg')$$,
  'green team uploads into own organisation folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('photos', 'bbbbbbbb-0000-0000-0000-000000000000/t04.jpg')$$,
  '42501', null, 'green team cannot upload into another organisation folder');

-- RLS: curator of A --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select is((select iucn_category from org_taxon where inhouse_code = 'PRO'), 'LC', 'green team edit of status had no effect');
update org_taxon set iucn_category = 'VU' where inhouse_code = 'PRO';
select is((select iucn_category from org_taxon where inhouse_code = 'PRO'), 'VU', 'curator edits status fields');
select lives_ok(
  $$insert into taxon (kingdom, scientific_name, rank) values ('Plantae', 'Ziziphus spina-christi', 'species')$$,
  'curator adds a shared taxon');

-- RLS: owner of A is read-only ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}', true);
select is((select count(*)::int from asset), 4, 'owner reads assets');
select throws_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-00000000a001',
            'aaaaaaaa-0000-0000-0000-00000000e001', 'WG07-T07_PRO', pg_temp.lp(112, 112), 'planted')$$,
  '42501', null, 'owner cannot add assets');

-- RLS: manager of B sees nothing of A --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select results_eq(
  $$select (select count(*) from asset where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from asset_type where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from accession where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from org_taxon where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from asset_status_change where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from media where organisation_id <> 'bbbbbbbb-0000-0000-0000-000000000000')::int,
           (select count(*) from storage.objects where name not like 'bbbbbbbb-%')::int$$,
  $$values (0, 0, 0, 0, 0, 0, 0)$$, 'B reads zero rows of A on every 0.4 table and in storage');
select is((select count(*)::int from taxon), 2, 'taxa are shared across organisations');
select throws_ok(
  $$select asset_set_status('aaaaaaaa-0000-0000-0000-0000000a0001', 'removed', 'x')$$,
  'P0002', null, 'B cannot change A asset status');

select * from finish();
rollback;
