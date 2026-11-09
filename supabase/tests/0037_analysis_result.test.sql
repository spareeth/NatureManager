-- Analysis results (tree loss): members read, managers write, other organisations see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
create function pg_temp.as_user(u text) returns void language sql as
  $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create temp table tg as select s.id site, s.organisation_id org from site s join organisation o on o.id = s.organisation_id
 where o.slug = 'terra' and s.code = 'TG';
grant select on tg to authenticated;
insert into analysis_result (organisation_id, site_id, code, title, summary)
select org, site, 't_0037', 'Test', '{"mature": {"lost": 5}}' from tg;

select pg_temp.as_user('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is((select (summary -> 'mature' ->> 'lost')::int from analysis_result where code = 't_0037'), 5, 'green team reads the result');
update analysis_result set title = 'changed' where code = 't_0037';
select is((select title from analysis_result where code = 't_0037'), 'Test', 'green team cannot change it');
select throws_ok($$insert into analysis_result (organisation_id, site_id, code, title) select org, site, 'x', 'x' from tg$$,
  '42501', null, 'green team cannot add one');

reset role;
insert into organisation (id, name, slug) values ('9f000000-0000-0000-0000-00000000bbbb', 'Other', 'other-0037');
insert into auth.users (id, email) values ('9f000000-0000-0000-0000-0000000000bb', 'b@0037.test');
insert into membership (organisation_id, user_id, roles, display_name)
  values ('9f000000-0000-0000-0000-00000000bbbb', '9f000000-0000-0000-0000-0000000000bb', '{manager}', 'B');
select pg_temp.as_user('9f000000-0000-0000-0000-0000000000bb');
set local role authenticated;
select is((select count(*)::int from analysis_result), 0, 'another organisation sees nothing');

select * from finish();
rollback;
