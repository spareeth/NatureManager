-- Task 1.7: taxon search, curator-only edit, change history visibility.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log;

create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra';
grant select on tg to authenticated;
insert into taxon (id, kingdom, family, genus, scientific_name, rank, common_names) values
  ('b0000000-0000-0000-0000-0000000000d1', 'Plantae', 'Fabaceae', 'Prosopis', 'Prosopis cineraria', 'species', '{"en": ["Ghaf"]}'),
  ('b0000000-0000-0000-0000-0000000000d2', 'Plantae', 'Bignoniaceae', 'Tecomella', 'Tecomella undulata', 'species', '{}'),
  ('b0000000-0000-0000-0000-0000000000d3', 'Plantae', 'Asphodelaceae', 'Aloe', 'Aloe vera', 'species', '{}');
insert into org_taxon (organisation_id, taxon_id, inhouse_code, iucn_category, origin, zones_present, attributes)
select org, v.t::uuid, v.code, v.iucn, v.origin, v.zones::text[], v.attrs::jsonb from tg, (values
  ('b0000000-0000-0000-0000-0000000000d1', 'PRO', 'LC', 'native', '{WG}', '{"common_names": {"ar": ["غاف"]}}'),
  ('b0000000-0000-0000-0000-0000000000d2', 'TEC', 'EN', 'native', '{NG,EG}', '{}'),
  ('b0000000-0000-0000-0000-0000000000d3', null, null, 'exotic', '{SG}', '{"proposed_inhouse_code": "ALO"}')) v(t, code, iucn, origin, zones, attrs);
insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id)
select org, site, (select id from asset_type where organisation_id = org and code = 'TREE'), v.tag,
       (select st_pointonsurface(geom) from location where code = v.bed), v.st::asset_status, v.t::uuid
from tg, (values ('WG07-T01_PRO', 'WG-07', 'established', 'b0000000-0000-0000-0000-0000000000d1'),
                 ('WG07-T02_PRO', 'WG-07', 'dead', 'b0000000-0000-0000-0000-0000000000d1'),
                 ('NG04-T01_TEC', 'NG-04', 'established', 'b0000000-0000-0000-0000-0000000000d2')) v(tag, bed, st, t);
delete from audit_log;

-- Second organisation.
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-00000000000b', 'cur@other.test');
insert into organisation (id, name, slug) values ('ffffffff-0000-0000-0000-000000000000', 'Other', 'other');
insert into membership (organisation_id, user_id, roles, display_name)
values ('ffffffff-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', '{curator,manager}', 'Other');

create function pg_temp.names(j jsonb) returns text[] language sql as
  $$ select coalesce(array_agg(r ->> 'scientific_name' order by r ->> 'scientific_name'), '{}') from jsonb_array_elements(j -> 'rows') r $$;

-- As green1 -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select is((select (taxon_list(org) ->> 'total')::int from tg), 3, 'all organisation taxa listed');
select is((select pg_temp.names(taxon_list(org, 'غاف')) from tg), '{"Prosopis cineraria"}', 'search finds the organisation''s Arabic name');
select is((select pg_temp.names(taxon_list(org, 'ghaf')) from tg), '{"Prosopis cineraria"}', 'search finds the shared English name');
select is((select pg_temp.names(taxon_list(org, 'tec')) from tg), '{"Tecomella undulata"}', 'search by in-house code');
select is((select pg_temp.names(taxon_list(org, 'alo')) from tg), '{"Aloe vera"}', 'search by proposed code');
select is((select pg_temp.names(taxon_list(org, p_iucn => 'EN')) from tg), '{"Tecomella undulata"}', 'IUCN filter');
select is((select pg_temp.names(taxon_list(org, p_iucn => 'none')) from tg), '{"Aloe vera"}', 'not assessed filter');
select is((select pg_temp.names(taxon_list(org, p_code => 'proposed')) from tg), '{"Aloe vera"}', 'code proposed filter');
select is((select pg_temp.names(taxon_list(org, p_zone => 'EG')) from tg), '{"Tecomella undulata"}', 'zone filter');
select results_eq($$select (r ->> 'plants')::int, (r ->> 'dead')::int from tg, jsonb_array_elements(taxon_list(tg.org, 'PRO') -> 'rows') r$$,
  $$values (2, 1)$$, 'plant and dead counts');
select is((select taxon_detail(org, 'b0000000-0000-0000-0000-0000000000d1') -> 'plants_by_zone' from tg), '{"WG": 2}'::jsonb, 'detail counts plants per zone');

update org_taxon set iucn_category = 'VU' where taxon_id = 'b0000000-0000-0000-0000-0000000000d2';
select is((select taxon_detail(org, 'b0000000-0000-0000-0000-0000000000d2') -> 'org' ->> 'iucn_category' from tg), 'EN',
  'green team cannot change taxon status fields');
select is((select jsonb_array_length(taxon_history(org, 'b0000000-0000-0000-0000-0000000000d2')) from tg), 0,
  'green team does not see taxon history');

-- As the curator ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
update org_taxon set iucn_category = 'VU', protection_level = 'UAE federal list' where taxon_id = 'b0000000-0000-0000-0000-0000000000d2';
update org_taxon set inhouse_code = 'ALO', attributes = attributes - 'proposed_inhouse_code' where taxon_id = 'b0000000-0000-0000-0000-0000000000d3';
select is(
  (select h -> 'fields' from tg, jsonb_array_elements(taxon_history(tg.org, 'b0000000-0000-0000-0000-0000000000d2')) h),
  '[{"to": "VU", "from": "EN", "field": "iucn_category"}, {"to": "UAE federal list", "from": null, "field": "protection_level"}]'::jsonb,
  'curator edit recorded field by field');
select is((select taxon_history(org, 'b0000000-0000-0000-0000-0000000000d2') -> 0 ->> 'by' from tg), 'Terra Curator', 'history names the curator');
select is((select taxon_history(org, 'b0000000-0000-0000-0000-0000000000d3') -> 0 -> 'fields' from tg),
  '[{"to": null, "from": "ALO", "field": "attributes.proposed_inhouse_code"}, {"to": "ALO", "from": null, "field": "inhouse_code"}]'::jsonb,
  'attribute changes are listed per key');

-- As the manager: reads the history too.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select jsonb_array_length(taxon_history(org, 'b0000000-0000-0000-0000-0000000000d3')) from tg), 1, 'manager reads taxon history');

-- As the other organisation's curator.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select results_eq($$select (taxon_list(org) ->> 'total')::int, taxon_detail(org, 'b0000000-0000-0000-0000-0000000000d1') is null,
                           jsonb_array_length(taxon_history(org, 'b0000000-0000-0000-0000-0000000000d2')) from tg$$,
  $$values (0, true, 0)$$, 'other organisation sees no Terra taxa, detail or history');

select * from finish();
rollback;
