-- Task 0.5: seeded Terra organisation, TG site and grid, teams, users, asset types.
-- Runs against the seeded database (`npx supabase db reset` then `npx supabase test db`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is((select count(*)::int from organisation where slug = 'terra'), 1, 'organisation Terra seeded');
select is((select settings ->> 'timezone' from organisation where slug = 'terra'), 'Asia/Dubai',
  'Terra time zone is Asia/Dubai (NFR-07)');

select results_eq(
  $$select code, grid_origin_e, grid_origin_n, grid_rotation_deg, grid_scale from site
    where organisation_id = (select id from organisation where slug = 'terra')$$,
  $$values ('TG'::text, 481808::float8, 2761399::float8, 0::float8, 1::float8)$$,
  'site TG with the COORDINATES.md grid');
select ok((select abs(st_area(st_transform(boundary, 3997)) - 29876) < 1 from site where code = 'TG'),
  'TG boundary area is 29,876 m2 in EPSG:3997 (data/gis/README.md)');
select ok(
  (select st_xmin(e) between 0 and 11 and st_ymin(e) between 0 and 11
      and abs(st_xmax(e) - 237) < 1.5 and abs(st_ymax(e) - 229) < 1.5
   from (select site_to_local(id, boundary)::box2d e from site where code = 'TG') t),
  'TG boundary lies in the positive site grid, about 237 by 229 m');

select results_eq(
  $$select name, discipline from team order by name$$,
  $$values ('Green Team East'::text, 'living'::text), ('Green Team West', 'living'), ('Irrigation', 'built')$$,
  'three teams seeded');

select results_eq(
  $$select u.email::text, m.roles, t.name from membership m
    join auth.users u on u.id = m.user_id left join team t on t.id = m.team_id
    where m.organisation_id = (select id from organisation where slug = 'terra') order by u.email$$,
  $$values ('curator@terra.test'::text, '{curator}'::text[], null::text),
           ('engineer1@terra.test', '{field_engineer}', 'Irrigation'),
           ('fieldmanager@terra.test', '{field_manager}', null),
           ('green1@terra.test', '{green_team}', 'Green Team East'),
           ('green2@terra.test', '{green_team}', 'Green Team West'),
           ('manager@terra.test', '{manager}', null),
           ('owner@terra.test', '{owner}', null)$$,
  'one user per role, green team and engineers in teams');
select is((select count(*)::int from auth.identities i join auth.users u on u.id = i.user_id
           where u.email like '%@terra.test' and i.provider = 'email'), 7,
  'every seeded user has an email identity (magic link)');
select is((select count(*)::int from auth.users where email like '%@terra.test' and email_confirmed_at is null), 0,
  'seeded emails are confirmed');

select results_eq(
  $$select asset_class::text, count(*)::int from asset_type group by 1 order by 1$$,
  $$values ('built'::text, 12), ('living', 3)$$,
  'asset type catalogue: 3 living, 12 built (FR-AST-01)');
select is(
  (select array_agg(code order by code) from asset_type where asset_class = 'living'),
  '{GROUP,PLANT,TREE}'::text[], 'living asset types');
select is((select count(*)::int from asset_type where attribute_schema ->> 'type' <> 'object'), 0,
  'every attribute_schema is a JSON Schema object');

select * from finish();
rollback;
