-- Seed: one local user per role (task 0.5). Sign in by magic link; local emails land in
-- Mailpit (http://127.0.0.1:54324). Local development only.
create temp table seed_user (id uuid, email text, roles text[], display_name text, team text) on commit drop;
insert into seed_user values
  ('10000000-0000-0000-0000-000000000001', 'owner@terra.test',        '{owner}',          'Terra Owner',        null),
  ('10000000-0000-0000-0000-000000000002', 'manager@terra.test',      '{manager}',        'Terra Manager',      null),
  ('10000000-0000-0000-0000-000000000003', 'fieldmanager@terra.test', '{field_manager}',  'Terra Field Manager', null),
  ('10000000-0000-0000-0000-000000000004', 'curator@terra.test',      '{curator}',        'Terra Curator',      null),
  ('10000000-0000-0000-0000-000000000005', 'green1@terra.test',       '{green_team}',     'Green One',          'Green Team East'),
  ('10000000-0000-0000-0000-000000000006', 'green2@terra.test',       '{green_team}',     'Green Two',          'Green Team West'),
  ('10000000-0000-0000-0000-000000000007', 'engineer1@terra.test',    '{field_engineer}', 'Engineer One',       'Irrigation');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, now(),
       '{"provider": "email", "providers": ["email"]}', jsonb_build_object('display_name', display_name),
       now(), now(), '', '', '', ''
from seed_user;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from seed_user;

insert into membership (organisation_id, user_id, roles, display_name, team_id)
select o.id, u.id, u.roles, u.display_name, t.id
from seed_user u
join organisation o on o.slug = 'terra'
left join team t on t.organisation_id = o.id and t.name = u.team;
