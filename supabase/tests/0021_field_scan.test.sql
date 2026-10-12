-- Task 2.7: scanning an asset shows its open jobs, marks the ones that are mine.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;

create temp table tg as select s.id site, s.organisation_id org,
  (select id from asset a where a.organisation_id = s.organisation_id order by tag_code limit 1) asset
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
-- start from the seed alone: make sure there is an asset to scan
insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status)
select org, site, (select id from asset_type where organisation_id = org limit 1), 'SCAN-T01',
       extensions.st_setsrid(extensions.st_makepoint(55.1545, 24.9588), 4326), 'active'
from tg where asset is null and exists (select 1 from asset_type where organisation_id = org);
update tg set asset = coalesce(asset, (select id from asset where tag_code = 'SCAN-T01'));

insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, assignee_user_id)
select v.id::uuid, org, site, 'manual', 'reactive', v.title, v.st::wo_status, v.who::uuid from tg, (values
  ('91000000-0000-0000-0000-0000000000a1', 'Mine open',   'scheduled', '10000000-0000-0000-0000-000000000005'),
  ('91000000-0000-0000-0000-0000000000a2', 'Other open',  'approved',  '10000000-0000-0000-0000-000000000006'),
  ('91000000-0000-0000-0000-0000000000a3', 'Closed',      'closed',    '10000000-0000-0000-0000-000000000005')) v(id, title, st, who);
insert into work_order_asset (organisation_id, work_order_id, asset_id)
select org, w.id, asset from tg, work_order w;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select field_scan(asset) ->> 'id' from tg), (select asset::text from tg), 'scan returns the asset');
select is((select jsonb_agg(j ->> 'title' order by j ->> 'title') from tg, jsonb_array_elements(field_scan(asset) -> 'jobs') j),
  '["Mine open", "Other open"]'::jsonb, 'open jobs only');
select is((select j ->> 'mine' from tg, jsonb_array_elements(field_scan(asset) -> 'jobs') j where j ->> 'title' = 'Mine open'),
  'true', 'my job is marked mine');
select is((select j ->> 'mine' from tg, jsonb_array_elements(field_scan(asset) -> 'jobs') j where j ->> 'title' = 'Other open'),
  'false', 'someone else''s job is not mine');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select field_scan(asset) from tg), null, 'another organisation cannot scan into this asset');
select * from finish();
rollback;
