-- Task 0.2: tenancy RLS and audit trigger. Run with `npx supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Fixtures (as postgres, bypassing RLS) -------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mgr_a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'green_a@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'mgr_b@test.local');

insert into organisation (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A', 'org-a'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B', 'org-b');

insert into team (id, organisation_id, name, discipline) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-000000000000', 'Green A', 'living'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000000', 'Green B', 'living');

insert into membership (organisation_id, user_id, roles, display_name, team_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', '{manager}', 'Mgr A', null),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', '{green_team}', 'Green A', 'aaaaaaaa-0000-0000-0000-0000000000f1'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', '{manager}', 'Mgr B', null);

-- Constraints ----------------------------------------------------------------
select throws_ok(
  $$insert into membership (organisation_id, user_id, roles, display_name, team_id)
    values ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c',
            '{green_team}', 'x', 'bbbbbbbb-0000-0000-0000-0000000000f1')$$,
  '23503', null, 'membership cannot point at a team in another organisation');
select throws_ok(
  $$insert into membership (organisation_id, user_id, roles, display_name)
    values ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', '{wizard}', 'x')$$,
  '23514', null, 'unknown role rejected');
select throws_ok(
  $$insert into team (organisation_id, name, discipline)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'magic')$$,
  '23514', null, 'unknown discipline rejected');

-- Audit trigger, on a scratch table shaped like a business table -------------
create table audit_probe (id uuid primary key default gen_random_uuid(), organisation_id uuid not null, v int);
create trigger audit_probe_audit after insert or update or delete on audit_probe
  for each row execute function audit_row();
insert into audit_probe (id, organisation_id, v)
  values ('aaaaaaaa-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000', 1);
update audit_probe set v = 2;
update audit_probe set v = 2;   -- no-op, not logged
delete from audit_probe;
select results_eq(
  $$select action, (old ->> 'v')::int, (new ->> 'v')::int from audit_log
    where table_name = 'audit_probe' order by id$$,
  $$values ('insert', null::int, 1), ('update', 1, 2), ('delete', 2, null::int)$$,
  'audit_row logs insert, update, delete and skips no-op updates');

-- Act as the manager of org A -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq('select slug from organisation', $$values ('org-a')$$, 'A manager sees only org A');
select is((select count(*)::int from team), 1, 'A manager sees only org A teams');
select is((select count(*)::int from membership), 2, 'A manager sees only org A members');
select is((select count(*)::int from membership where organisation_id = 'bbbbbbbb-0000-0000-0000-000000000000'), 0,
  'explicit filter on org B returns nothing');
select is((select count(*)::int from audit_log), 3, 'A manager reads org A audit log');
select ok(public.has_role('aaaaaaaa-0000-0000-0000-000000000000'::uuid, 'manager'), 'has_role true for own role');
select ok(not public.has_role('bbbbbbbb-0000-0000-0000-000000000000'::uuid, 'manager'), 'has_role false in other org');

select lives_ok(
  $$insert into team (organisation_id, name, discipline)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'Irrigation', 'built')$$,
  'A manager creates a team in org A');
select throws_ok(
  $$insert into team (organisation_id, name, discipline)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'Intruder', 'built')$$,
  '42501', null, 'A manager cannot create a team in org B');
update membership set display_name = 'hacked' where organisation_id = 'bbbbbbbb-0000-0000-0000-000000000000';
select throws_ok($$insert into audit_log (organisation_id, table_name, action)
  values ('aaaaaaaa-0000-0000-0000-000000000000', 'x', 'insert')$$,
  '42501', null, 'clients cannot write audit_log');

-- Act as a green team member of org A ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from membership), 2, 'green team reads own org members');
update membership set roles = '{manager}' where user_id = '00000000-0000-0000-0000-00000000000b';
select throws_ok(
  $$insert into team (organisation_id, name, discipline)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'Rogue', 'both')$$,
  '42501', null, 'green team cannot create teams');
select is((select count(*)::int from audit_log), 0, 'green team cannot read audit log');

-- Anonymous --------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from organisation), 0, 'anon sees no organisations');

-- Verify silent-blocked updates as postgres -------------------------------------
reset role;
select is((select display_name from membership where user_id = '00000000-0000-0000-0000-00000000000c'),
  'Mgr B', 'A manager update on org B membership had no effect');
select is((select roles from membership where user_id = '00000000-0000-0000-0000-00000000000b'),
  '{green_team}'::text[], 'green team could not escalate own roles');

select * from finish();
rollback;
