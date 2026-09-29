-- Task 0.2: tenancy (organisation, team, membership), RLS helpers, audit trigger.
-- Spec: docs/DATA_MODEL.md sections 1 and 9; SRS FR-SITE-01, NFR-01.

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table organisation (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}'   -- working calendar, SLA hours, locale
);

create table team (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  name text not null,                    -- e.g. Green Team East, Irrigation, Rangers
  discipline text not null               -- living, built, both
    check (discipline in ('living', 'built', 'both')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  -- lets membership reference (team_id, organisation_id) so a team cannot cross organisations
  unique (id, organisation_id)
);
create index on team (organisation_id);

create table membership (
  organisation_id uuid references organisation not null,
  user_id uuid references auth.users not null,
  roles text[] not null                  -- owner, manager, field_manager, curator, green_team, field_engineer
    check (cardinality(roles) > 0
       and roles <@ array['owner', 'manager', 'field_manager', 'curator', 'green_team', 'field_engineer']),
  display_name text not null,
  team_id uuid references team,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  primary key (organisation_id, user_id),
  foreign key (team_id, organisation_id) references team (id, organisation_id)
);
create index on membership (user_id);
create index on membership (team_id);

create trigger team_updated_at before update on team
  for each row execute function set_updated_at();
create trigger membership_updated_at before update on membership
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so policies on membership do not recurse)
-- ---------------------------------------------------------------------------

create function auth_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organisation_id from membership where user_id = auth.uid() and active
$$;

create function has_role(org uuid, r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membership
                 where user_id = auth.uid() and organisation_id = org
                   and active and r = any(roles))
$$;

-- Callable by anon too: policies evaluate them for every role, and with no auth.uid()
-- they return no organisations / false, so anon gets empty results rather than errors.
revoke execute on function auth_org_ids() from public;
revoke execute on function has_role(uuid, text) from public;
grant execute on function auth_org_ids() to anon, authenticated;
grant execute on function has_role(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- organisation: members read their own organisations. Creating and editing organisations
-- is a service operation (service role), not a client write.
alter table organisation enable row level security;
create policy organisation_read on organisation for select
  using (id in (select auth_org_ids()));
create policy organisation_update on organisation for update
  using (has_role(id, 'manager')) with check (has_role(id, 'manager'));

-- team: members read; managers and field managers (SRS: "manage teams") write.
alter table team enable row level security;
create policy team_read on team for select
  using (organisation_id in (select auth_org_ids()));
create policy team_write on team for all
  using (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'))
  with check (has_role(organisation_id, 'manager') or has_role(organisation_id, 'field_manager'));

-- membership: members read the member list of their organisations; only managers write,
-- so no user can grant themselves roles.
alter table membership enable row level security;
create policy membership_read on membership for select
  using (organisation_id in (select auth_org_ids()));
create policy membership_write on membership for all
  using (has_role(organisation_id, 'manager'))
  with check (has_role(organisation_id, 'manager'));

-- ---------------------------------------------------------------------------
-- Audit (DATA_MODEL section 9)
-- ---------------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references organisation,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  old jsonb,
  new jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);
create index on audit_log (organisation_id, table_name, row_id);
create index on audit_log (at);

-- Read-only for managers and owners; rows are written only by audit_row().
alter table audit_log enable row level security;
create policy audit_log_read on audit_log for select
  using (has_role(organisation_id, 'manager') or has_role(organisation_id, 'owner'));

-- Generic row audit trigger. Attach to audited tables as they are created:
--   create trigger <t>_audit after insert or update or delete on <t>
--     for each row execute function audit_row();
-- The table must have organisation_id and id columns.
create function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' and o = n then
    return null;
  end if;
  insert into audit_log (organisation_id, table_name, row_id, action, old, new, actor)
  values ((r ->> 'organisation_id')::uuid, tg_table_name, (r ->> 'id')::uuid,
          lower(tg_op), o, n, auth.uid());
  return null;
end
$$;
revoke execute on function audit_row() from public, anon, authenticated;
