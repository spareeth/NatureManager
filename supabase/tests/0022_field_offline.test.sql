-- Task 2.8: the offline pack carries my days, my jobs, assets in the zones of my jobs and the site extent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;

create temp table tg as select s.id site, s.organisation_id org
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
-- start from the seed alone: one asset in NG-01 and one in EG-01
insert into asset (organisation_id, site_id, asset_type_id, tag_code, geom, status, location_id)
select org, site, (select id from asset_type where organisation_id = org order by code limit 1), v.tag,
       (select st_pointonsurface(geom) from location where organisation_id = org and code = v.bed), 'active',
       (select id from location where organisation_id = org and code = v.bed)
from tg, (values ('OFF-NG', 'NG-01'), ('OFF-EG', 'EG-01')) v(tag, bed);

insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, assignee_user_id, planned_start, location_id)
select v.id::uuid, org, site, 'manual', 'preventive', v.title, 'scheduled', v.who::uuid,
       (('2026-11-02'::date + v.d)::timestamp + time '07:00') at time zone 'Asia/Dubai',
       (select id from location where organisation_id = org and code = v.bed)
from tg, (values
  ('92000000-0000-0000-0000-0000000000a1', 'Mine today',    '10000000-0000-0000-0000-000000000005', 0, 'NG-02'),
  ('92000000-0000-0000-0000-0000000000a2', 'Mine tomorrow', '10000000-0000-0000-0000-000000000005', 1, 'NG-03'),
  ('92000000-0000-0000-0000-0000000000a3', 'Not mine',      '10000000-0000-0000-0000-000000000006', 0, 'EG-02')) v(id, title, who, d, bed);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
create temp table pack as select field_offline_pack((select site from tg), '2026-11-02', '2026-11-03') p;
select is((select jsonb_object_keys(p -> 'days') from pack order by 1 limit 1), '2026-11-02', 'a list per day');
select is((select jsonb_array_length(p -> 'days' -> '2026-11-03') from pack), 2, 'tomorrow: my job plus today''s unfinished one');
select is((select jsonb_agg(j ->> 'title' order by j ->> 'title') from pack, jsonb_array_elements(p -> 'jobs') j),
  '["Mine today", "Mine tomorrow"]'::jsonb, 'jobs: mine only, each with full job detail');
select ok((select bool_and(j ? 'steps') from pack, jsonb_array_elements(p -> 'jobs') j), 'jobs carry SOP steps');
select ok((select bool_or(a ->> 'tag_code' = 'OFF-NG') and not bool_or(a ->> 'tag_code' = 'OFF-EG') from pack, jsonb_array_elements(p -> 'assets') a),
  'assets of my zone (NG) only');
select is((select jsonb_array_length(p -> 'bbox') from pack), 4, 'site extent for the tile cache');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select jsonb_array_length(field_offline_pack((select site from tg), '2026-11-02', '2026-11-03') -> 'assets')), 0,
  'another organisation gets nothing');
select * from finish();
rollback;
