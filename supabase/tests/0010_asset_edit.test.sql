-- Task 1.4: tag suggestion and checks, taxon search, catalogue Arabic names.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Start from the seed alone, even when the local database also holds migrated Hortis data.
-- Rolled back with the rest of the test.
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log;

create temp table tg as
  select s.id as site, s.organisation_id as org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.bed_pt(code text) returns geometry language sql as
  $$ select st_pointonsurface(geom) from location where code = $1 and organisation_id = (select org from tg) $$;
create function pg_temp.type_id(code text) returns uuid language sql as
  $$ select id from asset_type where code = $1 and organisation_id = (select org from tg) $$;

insert into taxon (id, kingdom, genus, scientific_name, rank, common_names) values
  ('60000000-0000-0000-0000-0000000000d1', 'Plantae', 'Prosopis', 'Prosopis cineraria', 'species', '{"en": ["Ghaf"], "ar": ["غاف"]}'),
  ('60000000-0000-0000-0000-0000000000d2', 'Plantae', 'Haloxylon', 'Haloxylon persicum', 'species', '{"en": ["White saxaul"]}');
insert into org_taxon (organisation_id, taxon_id, inhouse_code)
select org, '60000000-0000-0000-0000-0000000000d1'::uuid, 'PRO' from tg;

-- Existing tags in WG-07: T04 and T11 (gap), G02, and a valve VLV01.
insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
select org, site, pg_temp.type_id(v.type), v.tag, pg_temp.bed_pt('WG-07'), v.status::asset_status
from tg, (values ('TREE', 'WG07-T04_PRO', 'established'), ('TREE', 'WG07-T11_XYZ', 'established'),
                 ('GROUP', 'WG07-G02_PRO', 'planted'), ('VALVE', 'WG07-VLV01', 'active')) v(type, tag, status);

-- Catalogue ------------------------------------------------------------------------------------
select is((select count(*)::int from asset_type where organisation_id = (select org from tg) and name_ar is null), 0,
  'every seeded asset type has an Arabic name');
select is((select attribute_schema -> 'properties' -> 'height_m' ->> 'x-title-ar' from asset_type
           where code = 'TREE' and organisation_id = (select org from tg)), 'الارتفاع (م)', 'attribute labels carry x-title-ar');

-- Patterns -------------------------------------------------------------------------------------
select ok(tag_pattern_ok('WG07-T04_PRO', 'living') and tag_pattern_ok('WG07-G01_PRO', 'living')
          and tag_pattern_ok('SG03-VLV02', 'built') and tag_pattern_ok('EG11-T104_TAM', 'living'),
  'valid living, group, built and three-digit tags pass');
select ok(not tag_pattern_ok('WG7-T04_PRO', 'living') and not tag_pattern_ok('WG07-T04-PRO', 'living')
          and not tag_pattern_ok('SG03-VLV02', 'living') and not tag_pattern_ok('WG07-T04_PRO', 'built'),
  'malformed tags and tags of the other class fail');

-- As green1 -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);

select is((select suggest_tag(site, pg_temp.bed_pt('WG-07'), pg_temp.type_id('TREE'), '60000000-0000-0000-0000-0000000000d1') from tg),
  'WG07-T12_PRO', 'next tree number in the bed is max + 1 (12), with the in-house code');
select is((select suggest_tag(site, pg_temp.bed_pt('WG-07'), pg_temp.type_id('TREE'), '60000000-0000-0000-0000-0000000000d2') from tg),
  'WG07-T12_HAL', 'no in-house code: first three letters of the genus');
select is((select suggest_tag(site, pg_temp.bed_pt('WG-07'), pg_temp.type_id('GROUP'), '60000000-0000-0000-0000-0000000000d1', true) from tg),
  'WG07-G03_PRO', 'planting groups count separately (G)');
select is((select suggest_tag(site, pg_temp.bed_pt('WG-07'), pg_temp.type_id('VALVE')) from tg),
  'WG07-VLV02', 'built assets use the type prefix');
select is((select suggest_tag(site, pg_temp.bed_pt('SG-03'), pg_temp.type_id('PUMP')) from tg),
  'SG03-PMP01', 'first of its kind in a bed is 01');
select is((select suggest_tag(site, pg_temp.bed_pt('NG-01'), pg_temp.type_id('TREE')) from tg),
  'NG01-T01_XXX', 'living asset without a taxon yet gets a placeholder code');
select is((select suggest_tag(site, st_setsrid(st_makepoint(55.10, 24.90), 4326), pg_temp.type_id('TREE')) from tg),
  null, 'no suggestion outside every bed');

select results_eq($$select (c ->> 'pattern_ok')::boolean, c ->> 'taken_by' is not null
                    from tg, check_tag(tg.org, 'WG07-T04_PRO', 'living') c$$,
  $$values (true, true)$$, 'check_tag: valid pattern but taken');
select results_eq($$select (c ->> 'pattern_ok')::boolean, c ->> 'taken_by' is null
                    from tg, check_tag(tg.org, 'WG07-T04_PRO', 'living',
                                       (select id from asset where tag_code = 'WG07-T04_PRO')) c$$,
  $$values (true, true)$$, 'check_tag ignores the asset being edited');
select is((select check_tag(org, 'WG07-T4_PRO', 'living') ->> 'pattern_ok' from tg), 'false', 'check_tag: bad pattern');

select is((select taxon_search(org, 'PRO') -> 0 ->> 'scientific_name' from tg), 'Prosopis cineraria', 'taxon search by in-house code');
select is((select taxon_search(org, 'غاف') -> 0 ->> 'inhouse_code' from tg), 'PRO', 'taxon search by Arabic common name');
select is((select jsonb_array_length(taxon_search(org, '  ')) from tg), 0, 'blank search returns nothing');

-- Create through RLS with a suggested tag: green team may add assets.
select lives_ok(
  $$insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id)
    select org, site, pg_temp.type_id('TREE'),
           suggest_tag(site, pg_temp.bed_pt('WG-07'), pg_temp.type_id('TREE'), '60000000-0000-0000-0000-0000000000d1'),
           pg_temp.bed_pt('WG-07'), 'planted', '60000000-0000-0000-0000-0000000000d1' from tg$$,
  'green team creates an asset with the suggested tag');

select * from finish();
rollback;
