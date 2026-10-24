-- Task 2.10: item catalogue, item requests, ir_transition, auto-drafts and items from a work order.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);
delete from integration_outbox; delete from item_request_event; delete from item_request_line; delete from item_request;
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;

create temp table tg as select s.id site, s.organisation_id org,
  (select id from location l where l.organisation_id = s.organisation_id and l.code = 'NG-01') bed
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
-- start from the seed alone: a taxon with an in-house code and a living asset of it in NG-01
insert into taxon (id, kingdom, scientific_name, rank) values ('94000000-0000-0000-0000-0000000000d1', 'Plantae', 'Testia replacea', 'species')
  on conflict do nothing;
insert into org_taxon (organisation_id, taxon_id, inhouse_code) select org, '94000000-0000-0000-0000-0000000000d1', 'TRX' from tg;
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, taxon_id, location_id)
select '94000000-0000-0000-0000-0000000000a1', org, site, (select id from asset_type where organisation_id = org and code = 'TREE'),
       'NG01-T99_TRX', (select st_pointonsurface(geom) from location where id = bed), 'established',
       '94000000-0000-0000-0000-0000000000d1', bed from tg;
insert into work_order (id, organisation_id, site_id, location_id, source, wo_type, title, status, assignee_user_id)
select '94000000-0000-0000-0000-0000000000b1', org, site, bed, 'manual', 'preventive', 'Bed care NG-01', 'in_progress',
       '10000000-0000-0000-0000-000000000005' from tg;

-- Catalogue (FR-REQ-01) --------------------------------------------------------------------
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select throws_ok($$insert into item (organisation_id, code, name, category, unit) select org, 'X', 'x', 'other', 'each' from tg$$,
  '42501', null, 'green team cannot edit the catalogue');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select ok((select item_generate_plants(org) >= 1 from tg), 'manager generates plant items from taxa');
select is((select code from item where taxon_id = '94000000-0000-0000-0000-0000000000d1'), 'PLT-TRX', 'code from the in-house code');
select is((select item_generate_plants(org) from tg), 0, 'generating again adds nothing');
insert into item (id, organisation_id, code, name, category, unit, external_code)
select '94000000-0000-0000-0000-0000000000c1', org, 'MUL-01', 'Mulch, wood chip', 'soil_amendment', 'm3', 'ECD-4711' from tg;

-- Auto-draft (FR-REQ-03) --------------------------------------------------------------------
select lives_ok($$select asset_set_status('94000000-0000-0000-0000-0000000000a1', 'dead', 'borer damage')$$, 'manager records the plant dead');
select results_eq($$select r.source, r.status::text, r.requested_by, li.reason, li.quantity, i.code, li.asset_id
                    from item_request r join item_request_line li on li.item_request_id = r.id left join item i on i.id = li.item_id
                    where li.asset_id = '94000000-0000-0000-0000-0000000000a1'$$,
  $$values ('plant_death'::text, 'draft'::text, '10000000-0000-0000-0000-000000000002'::uuid, 'replace'::text, 1::numeric, 'PLT-TRX'::text,
            '94000000-0000-0000-0000-0000000000a1'::uuid)$$,
  'a replacement draft with the plant item, the same bed and who recorded it');
select ok((select number like 'IR-____-000___' from item_request where source = 'plant_death' and location_id = (select bed from tg) limit 1), 'numbered IR-YYYY-NNNNNN');
update asset set condition = 1 where id = '94000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from item_request_line where asset_id = '94000000-0000-0000-0000-0000000000a1'), 1,
  'no second draft while one is open for the asset');
reset role;
select set_config('request.jwt.claims', '', true);  -- system work: no signed-in user
insert into asset (id, organisation_id, site_id, asset_type_id, tag_code, geom, status, condition, taxon_id, location_id)
select '94000000-0000-0000-0000-0000000000a2', org, site, (select id from asset_type where organisation_id = org and code = 'TREE'),
       'NG01-T98_TRX', (select st_pointonsurface(geom) from location where id = bed), 'established', 4,
       '94000000-0000-0000-0000-0000000000d1', bed from tg;
update asset set condition = 2 where id = '94000000-0000-0000-0000-0000000000a2';
select results_eq($$select r.source, r.requested_by is null from item_request r join item_request_line li on li.item_request_id = r.id
                    where li.asset_id = '94000000-0000-0000-0000-0000000000a2'$$,
  $$values ('inspection'::text, true)$$, 'condition drop to 2 drafts an inspection request; system change has no requester');
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select ir_transition(r.id, 'submitted', null) from item_request r join item_request_line li on li.item_request_id = r.id
 where li.asset_id = '94000000-0000-0000-0000-0000000000a2';
select ok((select bool_or(to_status = 'approved') from item_request r join item_request_line li on li.item_request_id = r.id,
           ir_allowed_transitions(r.id) where li.asset_id = '94000000-0000-0000-0000-0000000000a2'),
  'a submitted system draft offers Approve to a manager');
reset role;

-- Lifecycle (FR-REQ-05) ----------------------------------------------------------------------
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
insert into item_request (id, organisation_id, site_id, location_id, source, needed_by)
select '94000000-0000-0000-0000-0000000000e1', org, site, bed, 'manager', '2026-11-15' from tg;
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'submitted', null)$$, '22023', null, 'cannot submit without lines');
insert into item_request_line (organisation_id, item_request_id, line_no, item_id, description, reason, quantity, unit, est_unit_cost)
select org, '94000000-0000-0000-0000-0000000000e1', 1, '94000000-0000-0000-0000-0000000000c1', 'Mulch for NG-01', 'maintain', 2, 'm3', 150 from tg;
select throws_ok($$update item_request set status = 'approved' where id = '94000000-0000-0000-0000-0000000000e1'$$, '42501', null,
  'no direct status update');
select lives_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'submitted', null)$$, 'requester submits');
select throws_ok($$update item_request_line set quantity = 5 where item_request_id = '94000000-0000-0000-0000-0000000000e1'$$, '42501', null,
  'lines are locked after submit');
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'approved', null)$$, '42501', null,
  'green team cannot approve');

reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'approved', null)$$, '42501', null,
  'field manager cannot approve 300 AED with the default limit of 0');
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'rejected', null)$$, '22023', null,
  'reject needs a reason');
reset role;
update organisation set settings = settings || '{"ir_field_manager_limit_aed": 500}' where slug = 'terra';
set local role authenticated;
select lives_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'approved', 'ok')$$, 'field manager approves within the limit');
select results_eq($$select status::text, approved_by from item_request where id = '94000000-0000-0000-0000-0000000000e1'$$,
  $$values ('approved'::text, '10000000-0000-0000-0000-000000000003'::uuid)$$, 'approved, with who approved');
reset role;
select results_eq($$select topic, payload ->> 'request_number', payload -> 'lines' -> 0 ->> 'external_code', payload ->> 'location_code'
                    from integration_outbox$$,
  $$select 'item_request.approved'::text, number, 'ECD-4711'::text, 'NG-01'::text from item_request where id = '94000000-0000-0000-0000-0000000000e1'$$,
  'approval wrote the outbox row in the same transaction, in the hand-off line format');
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'sent', null)$$, '42501', null,
  'sent is set by the hand-off, not by hand');
select is((select count(*)::int from ir_allowed_transitions('94000000-0000-0000-0000-0000000000e1')), 0, 'no manual moves from approved');
select is((select array_agg(to_status::text order by to_status) from item_request_event where item_request_id = '94000000-0000-0000-0000-0000000000e1'),
  '{submitted,approved}', 'every transition writes an event');

-- Items from a work order on the phone (FR-REQ-04), replay-safe ------------------------------
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
create temp table r1 (v jsonb);
grant all on r1 to authenticated;
insert into r1 select ir_add_wo_items('94000000-0000-0000-0000-0000000000b1', '94000000-0000-0000-0000-0000000000f1',
  '[{"id": "94000000-0000-0000-0000-0000000000f2", "item_id": "94000000-0000-0000-0000-0000000000c1", "description": "Mulch", "quantity": 1, "unit": "m3", "reason": "maintain"},
    {"id": "94000000-0000-0000-0000-0000000000f3", "description": "Tree tie", "quantity": 4, "unit": "each"}]', true);
select is((select v ->> 'status' from r1), 'submitted', 'items from the job are submitted');
select results_eq($$select r.source, r.work_order_id, (select count(*)::int from item_request_line where item_request_id = r.id)
                    from item_request r where r.client_uuid = '94000000-0000-0000-0000-0000000000f1'$$,
  $$values ('work_order'::text, '94000000-0000-0000-0000-0000000000b1'::uuid, 2)$$, 'linked to the work order with two lines');
select is((select ir_add_wo_items('94000000-0000-0000-0000-0000000000b1', '94000000-0000-0000-0000-0000000000f1',
  '[{"id": "94000000-0000-0000-0000-0000000000f2", "description": "Mulch", "quantity": 1, "unit": "m3"}]', true) ->> 'replayed'), 'true',
  'a replay changes nothing');
select is((select count(*)::int from item_request where client_uuid = '94000000-0000-0000-0000-0000000000f1'), 1, 'still one request');
select is((select count(*)::int from item_request_line li join item_request r on r.id = li.item_request_id
           where r.client_uuid = '94000000-0000-0000-0000-0000000000f1'), 2, 'still two lines');
select ok((select (ir_detail(id) -> 'lines' -> 0 ->> 'item_code') = 'MUL-01' from item_request where client_uuid = '94000000-0000-0000-0000-0000000000f1'),
  'detail shows the item code');
select ok((select jsonb_array_length(ir_list(site)) >= 3 from tg), 'list shows requests of the site');

-- Organisation B ----------------------------------------------------------------------------
reset role;
select pg_temp.as_user('20000000-0000-0000-0000-000000000099');
set local role authenticated;
select is((select count(*)::int from item_request), 0, 'another organisation sees no requests');
select throws_ok($$select ir_transition('94000000-0000-0000-0000-0000000000e1', 'cancelled', null)$$, 'P0002', null,
  'and cannot move them');
select * from finish();
rollback;
