-- Task 1.3: asset_search, asset_detail, asset_timeline and the asset audit read policy.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Start from the seed alone, even when the local database also holds migrated Hortis data.
-- Rolled back with the rest of the test.
delete from media; delete from asset_status_change; delete from asset; delete from accession;
delete from item_request; delete from item; delete from org_taxon; delete from taxon; delete from audit_log;

create temp table tg as
  select s.id as site, s.organisation_id as org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;

insert into taxon (id, kingdom, family, scientific_name, rank, common_names) values
  ('40000000-0000-0000-0000-0000000000d1', 'Plantae', 'Fabaceae', 'Prosopis cineraria', 'species', '{"en": ["Ghaf"], "ar": ["غاف"]}'),
  ('40000000-0000-0000-0000-0000000000d2', 'Plantae', 'Bignoniaceae', 'Tecomella undulata', 'species', '{"en": ["Desert teak"]}');
insert into org_taxon (organisation_id, taxon_id, inhouse_code, iucn_category)
select org, '40000000-0000-0000-0000-0000000000d1'::uuid, 'PRO', 'LC' from tg
union all select org, '40000000-0000-0000-0000-0000000000d2'::uuid, 'TEC', 'EN' from tg;
insert into accession (id, organisation_id, accession_number, taxon_id, provenance_type)
select '40000000-0000-0000-0000-0000000000f1', org, '2026-0050', '40000000-0000-0000-0000-0000000000d1', 'G' from tg;

-- Three assets: two trees in WG-07, one valve in SG-03.
create function pg_temp.in_bed(code text, dx float8 default 0) returns geometry language sql as $$
  select st_translate(st_pointonsurface(geom), dx * 0.000001, 0) from location
  where code = $1 and organisation_id = (select org from tg) $$;
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id, accession_id, condition, position_source)
select v.id::uuid, org, site, (select id from asset_type where organisation_id = org and code = v.type), v.tag,
       pg_temp.in_bed(v.bed, v.dx), v.status::asset_status, v.taxon::uuid, v.acc::uuid, v.cond, 'hortis'
from tg, (values
  ('40000000-0000-0000-0000-0000000000a1', 'TREE', 'WG07-T04_PRO', 'WG-07', 0.0, 'established',
   '40000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000f1', 4),
  ('40000000-0000-0000-0000-0000000000a2', 'TREE', 'WG07-T05_TEC', 'WG-07', 5.0, 'planted',
   '40000000-0000-0000-0000-0000000000d2', null, 2),
  ('40000000-0000-0000-0000-0000000000a3', 'VALVE', 'SG03-VLV02', 'SG-03', 0.0, 'active', null, null, 5)
) v(id, type, tag, bed, dx, status, taxon, acc, cond);

-- History on the first tree: condition change, status change with reason, a move, a photo.
update asset set condition = 3 where id = '40000000-0000-0000-0000-0000000000a1';
select asset_set_status('40000000-0000-0000-0000-0000000000a1', 'declining', 'Leaf scorch');
update asset set geom = st_translate(geom, 0.00001, 0), position_source = 'rtk'
  where id = '40000000-0000-0000-0000-0000000000a1';
update asset set name = 'Ghaf by the gate' where id = '40000000-0000-0000-0000-0000000000a1';
insert into media (organisation_id, bucket, path, kind, asset_id, caption)
select org, 'photos', org || '/assets/a1.jpg', 'photo', '40000000-0000-0000-0000-0000000000a1', 'Canopy' from tg;
-- Everything in this transaction shares now(); give each event its own minute, in the order
-- it happened: insert, condition, status, move, name edit (audit rows by id), then the photo.
update audit_log al set at = '2026-10-01 08:00+04'::timestamptz + r.n * interval '1 minute'
from (select id, row_number() over (order by id) as n from audit_log
      where row_id = '40000000-0000-0000-0000-0000000000a1') r
where al.id = r.id;
update asset_status_change set changed_at = '2026-10-01 08:03+04'
  where asset_id = '40000000-0000-0000-0000-0000000000a1' and from_status is not null;
update media set created_at = '2026-10-01 08:06+04' where asset_id = '40000000-0000-0000-0000-0000000000a1';

-- Second organisation.
insert into auth.users (id, email) values ('40000000-0000-0000-0000-00000000000b', 'mgr@other.test');
insert into organisation (id, name, slug) values ('dddddddd-0000-0000-0000-000000000000', 'Other', 'other');
insert into membership (organisation_id, user_id, roles, display_name)
values ('dddddddd-0000-0000-0000-000000000000', '40000000-0000-0000-0000-00000000000b', '{manager}', 'Other Mgr');

-- As green1 (green team, Terra) ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);

create function pg_temp.tags(j jsonb) returns text[] language sql as
  $$ select coalesce(array_agg(r ->> 'tag_code' order by r ->> 'tag_code'), '{}') from jsonb_array_elements(j -> 'rows') r $$;

select is((select (asset_search(site) ->> 'total')::int from tg), 3, 'search with no filter returns all three');
select is((select pg_temp.tags(asset_search(site, 'ghaf')) from tg), '{WG07-T04_PRO}', 'search by English common name');
select is((select pg_temp.tags(asset_search(site, 'غاف')) from tg), '{WG07-T04_PRO}', 'search by Arabic common name');
select is((select pg_temp.tags(asset_search(site, 'TEC')) from tg), '{WG07-T05_TEC}', 'search by in-house code and tag');
select is((select pg_temp.tags(asset_search(site, 'tecomella')) from tg), '{WG07-T05_TEC}', 'search by scientific name');
select is((select pg_temp.tags(asset_search(site, p_class => 'built')) from tg), '{SG03-VLV02}', 'filter by class');
select is((select pg_temp.tags(asset_search(site, p_status => '{planted,declining}')) from tg),
  '{WG07-T04_PRO,WG07-T05_TEC}', 'filter by several statuses');
select is((select pg_temp.tags(asset_search(site, p_location => 'WG')) from tg),
  '{WG07-T04_PRO,WG07-T05_TEC}', 'zone filter finds assets in its beds');
select is((select pg_temp.tags(asset_search(site, p_location => 'SG-03')) from tg), '{SG03-VLV02}', 'bed filter');
select is(
  (select array_agg(r ->> 'tag_code') from tg, jsonb_array_elements(asset_search(tg.site, p_sort => 'condition', p_desc => true) -> 'rows') r),
  '{SG03-VLV02,WG07-T04_PRO,WG07-T05_TEC}', 'sort by condition, descending');
select results_eq(
  $$select (j ->> 'total')::int, jsonb_array_length(j -> 'rows') from tg, asset_search(tg.site, p_limit => 1, p_offset => 2) j$$,
  $$values (3, 1)$$, 'paging keeps the total');
select is((select asset_search(site, 'WG07-T04') -> 'rows' -> 0 ->> 'zone_code' from tg), 'WG', 'rows carry bed and zone');

select results_eq(
  $$select d ->> 'tag_code', d -> 'taxon' ->> 'inhouse_code', d -> 'accession' ->> 'accession_number',
           d -> 'location' ->> 'code', d -> 'location' ->> 'zone_code', d -> 'type' ->> 'asset_class'
    from asset_detail('40000000-0000-0000-0000-0000000000a1') d$$,
  $$values ('WG07-T04_PRO'::text, 'PRO'::text, '2026-0050'::text, 'WG-07'::text, 'WG'::text, 'living'::text)$$,
  'asset_detail joins taxon, accession, bed and zone');
select ok((select (d ->> 'local_x') is not null and (d -> 'type' -> 'attribute_schema' ->> 'type') = 'object'
           from asset_detail('40000000-0000-0000-0000-0000000000a1') d), 'detail has grid x, y and the attribute schema');

select is(
  (select array_agg(e ->> 'kind' order by ord desc)
   from jsonb_array_elements(asset_timeline('40000000-0000-0000-0000-0000000000a1')) with ordinality t(e, ord)),
  '{created,condition,status,moved,edited,photo}', 'timeline: created, condition, status, moved, edited, photo (oldest first)');
select ok(
  (select e -> 'data' ->> 'reason' = 'Leaf scorch' and e -> 'data' ->> 'from' = 'established'
   from jsonb_array_elements(asset_timeline('40000000-0000-0000-0000-0000000000a1')) e where e ->> 'kind' = 'status'),
  'status event carries from and reason');
select is(
  (select e -> 'data' -> 'fields' from jsonb_array_elements(asset_timeline('40000000-0000-0000-0000-0000000000a1')) e
   where e ->> 'kind' = 'edited'), '["name"]'::jsonb, 'edited event lists only the real field changes');
select is(
  (select e -> 'data' ->> 'position_source' from jsonb_array_elements(asset_timeline('40000000-0000-0000-0000-0000000000a1')) e
   where e ->> 'kind' = 'moved'), 'rtk', 'moved event shows the new position source');

select ok((select count(*) > 0 from audit_log where table_name = 'asset'), 'green team reads asset audit history');
select is((select count(*)::int from audit_log where table_name <> 'asset'), 0, 'green team still cannot read other audit rows');

-- As the other organisation ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select results_eq(
  $$select (asset_search(site) ->> 'total')::int, asset_detail('40000000-0000-0000-0000-0000000000a1') is null,
           jsonb_array_length(asset_timeline('40000000-0000-0000-0000-0000000000a1')) from tg$$,
  $$values (0, true, 0)$$, 'other organisation: no search rows, no detail, empty timeline');
select is((select count(*)::int from audit_log where table_name = 'asset'), 0, 'other organisation reads no Terra asset audit');

select * from finish();
rollback;
