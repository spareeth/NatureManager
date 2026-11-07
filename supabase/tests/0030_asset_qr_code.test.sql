-- Permanent QR codes: generated for every asset, unique, never changed, found by a scan.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status)
select '9a000000-0000-0000-0000-0000000000a1', org, site, (select id from asset_type where organisation_id = org and code = 'TREE'),
       'QR01-T01_TST', extensions.st_setsrid(extensions.st_makepoint(55.1545, 24.9588), 4326), 'planted' from tg;
select ok((select qr_code ~ '^TG-[2-9A-HJKMNP-Z]{6}$' from asset where id = '9a000000-0000-0000-0000-0000000000a1'),
  'a new asset gets a QR code: site code and 6 characters without look-alikes');
select is((select count(*)::int from asset where qr_code is null), 0, 'every asset has one');
select is((select count(*) - count(distinct qr_code) from asset)::int, 0, 'all QR codes are unique');
select throws_ok($$update asset set qr_code = 'TG-AAAAAA' where id = '9a000000-0000-0000-0000-0000000000a1'$$, '42501', null,
  'the QR code never changes, even for the database owner');
update asset set tag_code = 'QR01-T02_TST' where id = '9a000000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select results_eq($$select id, matched from asset_by_code(lower((select qr_code from asset where id = '9a000000-0000-0000-0000-0000000000a1')))$$,
  $$values ('9a000000-0000-0000-0000-0000000000a1'::uuid, 'qr'::text)$$, 'a scan of the QR code finds the asset, any case');
select is((select tag_code from asset_by_code((select qr_code from asset where id = '9a000000-0000-0000-0000-0000000000a1'))),
  'QR01-T02_TST', 'and still after the tag code was corrected');
select ok((select (asset_labels(array['9a000000-0000-0000-0000-0000000000a1'::uuid]) -> 0 ->> 'qr_code') like 'TG-%'),
  'labels carry the QR code');
select * from finish();
rollback;
