-- Task 1.5: asset_by_code (QR and barcode scans) and asset_labels.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Start from the seed alone, even when the local database also holds migrated Hortis data.
-- Rolled back with the rest of the test.
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log;

create temp table tg as
  select s.id as site, s.organisation_id as org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
insert into taxon (id, kingdom, scientific_name, rank, common_names) values
  ('80000000-0000-0000-0000-0000000000d1', 'Plantae', 'Prosopis cineraria', 'species', '{"en": ["Ghaf"], "ar": ["غاف"]}');
insert into org_taxon (organisation_id, taxon_id, inhouse_code) select org, '80000000-0000-0000-0000-0000000000d1'::uuid, 'PRO' from tg;
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, barcode, geom, status, taxon_id)
select v.id::uuid, org, site, (select id from asset_type where organisation_id = org and code = v.type), v.tag, v.bc,
       (select st_pointonsurface(geom) from location where code = 'WG-07' and organisation_id = org), v.st::asset_status, v.tx::uuid
from tg, (values ('80000000-0000-0000-0000-0000000000a1', 'TREE', 'WG07-T04_PRO', null, 'established', '80000000-0000-0000-0000-0000000000d1'),
                 ('80000000-0000-0000-0000-0000000000a2', 'VALVE', 'WG07-VLV01', '4006381333931', 'active', null)) v(id, type, tag, bc, st, tx);

-- A second organisation with its own asset under the same tag.
insert into auth.users (id, email) values ('80000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('eeeeeeee-0000-0000-0000-000000000000', 'Other', 'other');
insert into membership (organisation_id, user_id, roles, display_name)
values ('eeeeeeee-0000-0000-0000-000000000000', '80000000-0000-0000-0000-00000000000b', '{manager}', 'Other');
insert into site (id, organisation_id, code, name, site_type, boundary)
select 'eeeeeeee-0000-0000-0000-0000000000f1'::uuid, 'eeeeeeee-0000-0000-0000-000000000000', 'OX', 'Other site', 'park', boundary from site where code = 'TG' limit 1;
insert into asset_type (id, organisation_id, asset_class, code, name)
values ('eeeeeeee-0000-0000-0000-0000000000e1', 'eeeeeeee-0000-0000-0000-000000000000', 'living', 'TREE', 'Tree');
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status)
select 'eeeeeeee-0000-0000-0000-0000000000a1', 'eeeeeeee-0000-0000-0000-000000000000', 'eeeeeeee-0000-0000-0000-0000000000f1',
       'eeeeeeee-0000-0000-0000-0000000000e1', 'WG07-T04_PRO', st_centroid(boundary), 'planted'
from site where id = 'eeeeeeee-0000-0000-0000-0000000000f1';

-- As green1 (Terra) -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);

select results_eq($$select id, matched from asset_by_code('WG07-T04_PRO')$$,
  $$values ('80000000-0000-0000-0000-0000000000a1'::uuid, 'tag'::text)$$, 'tag resolves to the Terra asset only');
select is((select id from asset_by_code('  wg07-t04_pro ')), '80000000-0000-0000-0000-0000000000a1'::uuid,
  'tag match ignores case and spaces');
select results_eq($$select id, matched from asset_by_code('4006381333931')$$,
  $$values ('80000000-0000-0000-0000-0000000000a2'::uuid, 'barcode'::text)$$, 'existing Code 128 barcode resolves');
select is((select count(*)::int from asset_by_code('NOPE-1')), 0, 'unknown code: no row');

select results_eq(
  $$select l ->> 'tag_code', l ->> 'scientific_name', l ->> 'common_name', l ->> 'common_name_ar', l ->> 'location_code'
    from jsonb_array_elements(asset_labels(array['80000000-0000-0000-0000-0000000000a2', '80000000-0000-0000-0000-0000000000a1']::uuid[])) l$$,
  $$values ('WG07-T04_PRO'::text, 'Prosopis cineraria'::text, 'Ghaf'::text, 'غاف'::text, 'WG-07'::text),
           ('WG07-VLV01', null, null, null, 'WG-07')$$,
  'labels in tag order with names and bed');
select is((select jsonb_array_length(asset_labels(array['eeeeeeee-0000-0000-0000-0000000000a1']::uuid[]))), 0,
  'labels for another organisation''s asset: nothing');

-- As the other organisation -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select id from asset_by_code('WG07-T04_PRO')), 'eeeeeeee-0000-0000-0000-0000000000a1'::uuid,
  'same tag in another organisation resolves to its own asset');
select is((select count(*)::int from asset_by_code('4006381333931')), 0, 'cannot resolve Terra''s barcode');

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select * from asset_by_code('WG07-T04_PRO')$$, '42501', null, 'anon cannot resolve codes');

select * from finish();
rollback;
