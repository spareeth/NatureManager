-- Task 2.5: SOP drafts, approval, immutability of approved versions, new versions, reorder.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
delete from sop_response; delete from work_order_event; delete from work_order_asset; delete from work_order;
delete from pm_schedule; delete from wo_template; delete from sop;

create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
  where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- As the manager -------------------------------------------------------------------------
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$insert into sop (organisation_id, code, title, status) select org, 'SOP-X', '{"en": "x"}', 'approved' from tg$$,
  '42501', null, 'a new SOP cannot start approved');
insert into sop (id, organisation_id, code, title, ppe) select '90000000-0000-0000-0000-0000000000c1', org, 'SOP-BED',
  '{"en": "Bed care", "ar": "العناية بالحوض"}', '{gloves}' from tg;
select throws_ok($$select sop_approve('90000000-0000-0000-0000-0000000000c1')$$, '22023', null, 'an SOP without steps cannot be approved');
insert into sop_step (id, organisation_id, sop_id, seq, text, input_type, required)
select v.id::uuid, org, '90000000-0000-0000-0000-0000000000c1', v.seq, v.t::jsonb, v.k, v.req from tg,
  (values ('90000000-0000-0000-0000-0000000000d1', 1, '{"en": "Weed the bed", "ar": "إزالة الأعشاب"}', 'tick', true),
          ('90000000-0000-0000-0000-0000000000d2', 2, '{"en": "Mulch depth (cm)"}', 'number', false),
          ('90000000-0000-0000-0000-0000000000d3', 3, '{"en": "Photo after"}', 'photo', true)) v(id, seq, t, k, req);
select lives_ok($$update sop set purpose = '{"en": "Keep beds clean"}' where id = '90000000-0000-0000-0000-0000000000c1'$$, 'drafts can be edited');
select lives_ok($$select sop_reorder('90000000-0000-0000-0000-0000000000c1',
                    array['90000000-0000-0000-0000-0000000000d3', '90000000-0000-0000-0000-0000000000d1', '90000000-0000-0000-0000-0000000000d2']::uuid[])$$,
  'steps of a draft can be reordered');
select is((select array_agg(seq order by id) from sop_step where sop_id = '90000000-0000-0000-0000-0000000000c1'), '{2,3,1}', 'new order applied');
select throws_ok($$select sop_reorder('90000000-0000-0000-0000-0000000000c1', array['90000000-0000-0000-0000-0000000000d1']::uuid[])$$,
  '22023', null, 'reorder needs every step once');
select lives_ok($$select sop_approve('90000000-0000-0000-0000-0000000000c1')$$, 'manager approves the draft');
select results_eq($$select status, approved_by from sop where id = '90000000-0000-0000-0000-0000000000c1'$$,
  $$values ('approved'::text, '10000000-0000-0000-0000-000000000002'::uuid)$$, 'approved, with who approved it');

-- Approved versions are read-only.
select throws_ok($$update sop set title = '{"en": "Changed"}' where id = '90000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'approved SOP cannot be edited');
select throws_ok($$update sop_step set text = '{"en": "Changed"}' where id = '90000000-0000-0000-0000-0000000000d1'$$, '42501', null, 'approved steps cannot be edited');
select throws_ok($$insert into sop_step (organisation_id, sop_id, seq, text, input_type) select org, '90000000-0000-0000-0000-0000000000c1', 9, '{"en": "x"}', 'tick' from tg$$,
  '42501', null, 'no steps can be added to an approved SOP');
select throws_ok($$delete from sop where id = '90000000-0000-0000-0000-0000000000c1'$$, '42501', null, 'approved SOP cannot be deleted');

-- New version, approve it: v1 retires, a work order pinned to v1 keeps v1.
reset role;
insert into work_order (id, organisation_id, site_id, source, wo_type, title, status, sop_id)
select '90000000-0000-0000-0000-0000000000a1', org, site, 'manual', 'preventive', 'Pinned job', 'scheduled', '90000000-0000-0000-0000-0000000000c1' from tg;
set local role authenticated;
create temp table v2 (id uuid);
grant all on v2 to authenticated;
insert into v2 select sop_new_version('90000000-0000-0000-0000-0000000000c1');
select results_eq($$select s.version, s.status, (select count(*)::int from sop_step where sop_id = s.id) from sop s where s.id = (select id from v2)$$,
  $$values (2, 'draft'::text, 3)$$, 'new version 2 is a draft with the steps copied');
select throws_ok($$select sop_new_version('90000000-0000-0000-0000-0000000000c1')$$, '23505', null, 'only one draft per SOP');
update sop_step set text = '{"en": "Weed and edge the bed"}' where sop_id = (select id from v2) and input_type = 'tick';
select lives_ok($$select sop_approve((select id from v2))$$, 'version 2 approved');
select results_eq($$select version, status from sop where code = 'SOP-BED' order by version$$,
  $$values (1, 'retired'::text), (2, 'approved')$$, 'v1 retired, v2 current');
select is((select st.text ->> 'en' from work_order w join sop_step st on st.sop_id = w.sop_id
           where w.id = '90000000-0000-0000-0000-0000000000a1' and st.input_type = 'tick'), 'Weed the bed',
  'the pinned work order still shows version 1''s wording');
select results_eq($$select l ->> 'code', (l -> 'current' ->> 'version')::int, (l ->> 'retired')::int, l -> 'draft' is null or l -> 'draft' = 'null'::jsonb
                    from tg, jsonb_array_elements(sop_library(tg.org)) l$$,
  $$values ('SOP-BED'::text, 2, 1, true)$$, 'library: current v2, one retired, no draft');

-- The curator cannot approve.
select sop_new_version((select id from v2));
select pg_temp.as_user('10000000-0000-0000-0000-000000000004');
select throws_ok($$select sop_approve((select id from sop where code = 'SOP-BED' and status = 'draft'))$$, '42501', null, 'only managers approve');
reset role;

select * from finish();
rollback;
