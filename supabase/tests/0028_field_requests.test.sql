-- Requests in the field app: open requests for everyone, my requests with status and last note.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
delete from item_request_event; delete from item_request_line; delete from item_request;
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;
create temp table tg as select s.id site, s.organisation_id org,
  (select id from location l where l.organisation_id = s.organisation_id and l.code = 'NG-02') bed
  from site s join organisation o on o.id = s.organisation_id where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- Green One raises two requests and an item request; Green Two raises one.
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
insert into work_order (id, organisation_id, site_id, location_id, source, wo_type, title, status, priority)
select v.id::uuid, org, site, bed, 'request', v.k, v.t, 'requested', v.p from tg,
  (values ('98000000-0000-0000-0000-0000000000a1', 'reactive', 'Leak at NG-02', 'P2'),
          ('98000000-0000-0000-0000-0000000000a2', 'project', 'Bench by the path', 'P4')) v(id, k, t, p);
insert into item_request (id, organisation_id, site_id, source) select '98000000-0000-0000-0000-0000000000e1', org, site, 'manager' from tg;
insert into item_request_line (organisation_id, item_request_id, line_no, description, reason, quantity, unit)
select org, '98000000-0000-0000-0000-0000000000e1', 1, 'Tree tie', 'maintain', 4, 'each' from tg;
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000006');
set local role authenticated;
insert into work_order (organisation_id, site_id, source, wo_type, title, status)
select org, site, 'request', 'reactive', 'Fallen branch', 'requested' from tg;
-- The field manager cancels the bench with a reason.
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000003');
set local role authenticated;
select wo_transition('98000000-0000-0000-0000-0000000000a2', 'cancelled', 'Not this season');

-- As Green One
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
create temp table fr as select field_requests((select site from tg)) r;
select is((select jsonb_array_length(r -> 'open') from fr), 2, 'open: the requests not yet scheduled, from everyone');
select is((select array_agg(x ->> 'title' order by x ->> 'title') from fr, jsonb_array_elements(r -> 'open') x), '{"Fallen branch","Leak at NG-02"}',
  'cancelled requests are not open');
select is((select (r -> 'open' -> 0 ->> 'priority') from fr), 'P2', 'most urgent first');
select is((select jsonb_array_length(r -> 'mine') from fr), 3, 'mine: my work requests and my item request');
select is((select x ->> 'note' from fr, jsonb_array_elements(r -> 'mine') x where x ->> 'title' = 'Bench by the path'), 'Not this season',
  'with the reason a request was cancelled');
select is((select x ->> 'title' from fr, jsonb_array_elements(r -> 'mine') x where x ->> 'kind' = 'items'), '4 each Tree tie', 'item request summary');

reset role;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}', true);
set local role authenticated;
select is((select jsonb_array_length(field_requests((select site from tg)) -> 'open')), 0, 'another organisation sees nothing');
select * from finish();
rollback;
