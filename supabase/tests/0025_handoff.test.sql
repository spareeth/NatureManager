-- Task 2.11: export batches and the pull API with acknowledge (FR-REQ-06, 07).
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);
delete from integration_receiver; delete from integration_outbox; delete from item_request_event; delete from item_request_line; delete from item_request;

create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated, anon;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- Three requests raised by green1 and approved by the manager; one more left submitted.
insert into item (id, organisation_id, code, name, category, unit, external_code)
select '95000000-0000-0000-0000-0000000000c1', org, 'MUL-T', 'Mulch', 'soil_amendment', 'm3', 'ECD-4711' from tg;
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
insert into item_request (id, organisation_id, site_id, source, needed_by)
select v.id::uuid, org, site, 'manager', '2026-11-15' from tg,
  (values ('95000000-0000-0000-0000-0000000000e1'), ('95000000-0000-0000-0000-0000000000e2'),
          ('95000000-0000-0000-0000-0000000000e3'), ('95000000-0000-0000-0000-0000000000e4')) v(id);
insert into item_request_line (organisation_id, item_request_id, line_no, item_id, description, reason, quantity, unit, est_unit_cost)
select org, r.id, 1, '95000000-0000-0000-0000-0000000000c1', 'Mulch', 'maintain', 2, 'm3', 150 from tg, item_request r;
select count(ir_transition(id, 'submitted', null)) from item_request;
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select count(ir_transition(id, 'approved', null)) from item_request where id <> '95000000-0000-0000-0000-0000000000e4';

-- Export (FR-REQ-06) --------------------------------------------------------------------------
select is((select jsonb_array_length(ir_export_rows(org)) from tg), 3, 'preview: three approved lines waiting');
select is((select ir_export_rows(org) -> 0 ->> 'external_code' from tg), 'ECD-4711', 'line format carries the external code');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select throws_ok($$select ir_export((select org from tg))$$, '42501', null, 'field manager cannot export');
select throws_ok($$select ir_system_transition('95000000-0000-0000-0000-0000000000e1', 'sent', null, 'x')$$, '42501', null,
  'clients cannot call the system transition');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
create temp table ex (v jsonb);
grant all on ex to authenticated, anon;
insert into ex select ir_export(org) from tg;
select ok((select v ->> 'batch_id' is not null from ex), 'export makes a batch');
select is((select jsonb_array_length(v -> 'rows') from ex), 3, 'with the three lines');
select is((select count(*)::int from item_request where status = 'sent' and sent_batch_id = (select (v ->> 'batch_id')::uuid from ex)), 3,
  'the requests are sent, with the batch id');
select is((select count(*)::int from integration_outbox where delivered_at is not null and channel = 'export'), 3, 'outbox rows delivered');
select is((select actor_system from item_request_event where to_status = 'sent' limit 1), 'export', 'events name the channel');
select is((select ir_export(org) ->> 'batch_id' from tg), null, 'exporting again sends nothing twice');
select is((select jsonb_array_length(ir_export_rows(org, (select (v ->> 'batch_id')::uuid from ex))) from tg), 3, 'the batch can be downloaded again');
select is((select jsonb_array_length(ir_batches(org)) from tg), 1, 'batches are listed');

-- Receiver and API key (FR-REQ-07) ------------------------------------------------------------
create temp table rc (v jsonb);
grant all on rc to authenticated, anon;
insert into rc select receiver_create(org, 'ECD procurement') from tg;
select ok((select v ->> 'api_key' like 'tgk_%' from rc), 'a receiver gets an API key, shown once');
select throws_ok($$select api_key_hash from integration_receiver$$, '42501', null, 'the key hash cannot be read back');
-- approve the fourth request, then pull it as the receiver
select ir_transition('95000000-0000-0000-0000-0000000000e4', 'approved', null);
reset role;
create temp table nums as select id, number from item_request;
grant select on nums to anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select api_item_requests('tgk_wrong', 'approved', null)$$, '28000', null, 'a wrong key is refused');
create temp table pl (v jsonb);
insert into pl select api_item_requests((select v ->> 'api_key' from rc), 'approved', null);
select is((select jsonb_array_length(v -> 'item_requests') from pl), 1, 'pull returns the approved request');
select is((select v -> 'item_requests' -> 0 ->> 'status' from pl), 'sent', 'and marks it sent');
select is((select jsonb_array_length(api_item_requests((select v ->> 'api_key' from rc), 'approved', null) -> 'item_requests')), 0,
  'pulling again returns nothing new');
select is((select jsonb_array_length(api_item_requests((select v ->> 'api_key' from rc), 'sent', null) -> 'item_requests')), 4,
  'sent and not acknowledged can be read again');
select is((select api_ack((select v ->> 'api_key' from rc), (select number from nums where id = '95000000-0000-0000-0000-0000000000e1'),
  'PR-778', 'acknowledged', null) ->> 'status'), 'acknowledged', 'acknowledge sets the status');
select is((select api_ack((select v ->> 'api_key' from rc), '95000000-0000-0000-0000-0000000000e1', 'PR-778', 'acknowledged', null) ->> 'replayed'),
  'true', 'the same acknowledgement again changes nothing');
select throws_ok($$select api_ack((select v ->> 'api_key' from rc), '95000000-0000-0000-0000-0000000000e2', null, 'rejected_by_receiver', null)$$,
  '22023', null, 'rejection needs a reason');
select is((select api_ack((select v ->> 'api_key' from rc), '95000000-0000-0000-0000-0000000000e1', null, 'fulfilled', null) ->> 'status'),
  'fulfilled', 'fulfilled after acknowledged');
reset role;
select results_eq($$select status::text, external_ref from item_request where id = '95000000-0000-0000-0000-0000000000e1'$$,
  $$values ('fulfilled'::text, 'PR-778'::text)$$, 'external reference kept');
select is((select actor_system from item_request_event where item_request_id = '95000000-0000-0000-0000-0000000000e1' and to_status = 'acknowledged'),
  'pull_api: ECD procurement', 'events name the receiver');
-- a key for another organisation's receiver sees nothing of Terra
insert into organisation (id, name, slug) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Other', 'other-org');
insert into integration_receiver (organisation_id, name, channel, api_key_hash)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'Other receiver', 'pull_api', encode(extensions.digest('tgk_other', 'sha256'), 'hex'));
set local role anon;
select is((select jsonb_array_length(api_item_requests('tgk_other', 'sent', null) -> 'item_requests')), 0,
  'another organisation''s key sees no Terra requests');
select throws_ok($$select api_ack('tgk_other', '95000000-0000-0000-0000-0000000000e2', 'X', 'acknowledged', null)$$, 'P0002', null,
  'and cannot acknowledge them');
select * from finish();
rollback;
