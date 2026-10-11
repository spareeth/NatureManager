-- Task 2.1: SOPs, work order templates, PM schedules, work orders and their events and SOP
-- responses (docs/DATA_MODEL.md section 5; SRS FR-WO, FR-PM, FR-SOP).
--
-- As for every business table (DATA_MODEL line 5, CLAUDE.md rule 1), the child tables sop_step,
-- work_order_asset and sop_response also carry organisation_id, plus created/updated columns,
-- and composite keys keep every reference inside one organisation.

-- ---------------------------------------------------------------------------
-- SOPs
-- ---------------------------------------------------------------------------

create table sop (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  code text not null, version int not null default 1 check (version >= 1),
  title jsonb not null,                  -- {"en": "...", "ar": "..."}
  purpose jsonb, ppe text[], hazards text[],
  status text not null default 'draft'   -- draft, approved, retired
    check (status in ('draft', 'approved', 'retired')),
  approved_by uuid references auth.users, approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code, version),
  unique (id, organisation_id),
  check (title ? 'en'),
  check ((status = 'approved') = (approved_at is not null) or status = 'retired')
);

create table sop_step (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  sop_id uuid not null references sop on delete cascade,
  seq int not null check (seq >= 1),
  text jsonb not null,                   -- {"en": "...", "ar": "..."}
  input_type text not null               -- tick, number, text, photo, choice
    check (input_type in ('tick', 'number', 'text', 'photo', 'choice')),
  choices text[], unit text,
  required boolean not null default false,
  media_path text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (sop_id, seq),
  unique (id, organisation_id),
  foreign key (sop_id, organisation_id) references sop (id, organisation_id) on delete cascade,
  check (text ? 'en'),
  check ((input_type = 'choice') = (choices is not null and cardinality(choices) > 0))
);

-- ---------------------------------------------------------------------------
-- Templates and PM schedules
-- ---------------------------------------------------------------------------

create table wo_template (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  code text not null, title text not null,
  wo_type text not null                  -- preventive, reactive, inspection, project
    check (wo_type in ('preventive', 'reactive', 'inspection', 'project')),
  default_priority text not null default 'P3' check (default_priority in ('P1', 'P2', 'P3', 'P4')),
  sop_id uuid references sop,
  team_id uuid references team,
  est_minutes int check (est_minutes > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, organisation_id),
  foreign key (sop_id, organisation_id) references sop (id, organisation_id),
  foreign key (team_id, organisation_id) references team (id, organisation_id)
);

create table pm_schedule (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  template_id uuid not null references wo_template,
  target_kind text not null              -- asset, asset_type_in_location, location
    check (target_kind in ('asset', 'asset_type_in_location', 'location')),
  target_asset_id uuid references asset,
  target_asset_type_id uuid references asset_type,
  target_location_id uuid references location,
  rule jsonb not null,                   -- {"freq":"weekly","interval":1,"byweekday":[0,1,2,3,4]}
                                         -- {"freq":"daily"} {"freq":"monthly","bymonthday":[1]}
                                         -- {"season":{"from_month":10,"to_month":4}}
  max_per_day int check (max_per_day > 0), -- load spreading
  horizon_days int not null default 14 check (horizon_days between 1 and 366),
  active boolean not null default true,
  last_generated_until date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  foreign key (template_id, organisation_id) references wo_template (id, organisation_id),
  foreign key (target_asset_id, organisation_id) references asset (id, organisation_id),
  foreign key (target_asset_type_id, organisation_id) references asset_type (id, organisation_id),
  check (rule ? 'freq' and rule ->> 'freq' in ('daily', 'weekly', 'monthly')),
  -- the target columns match the kind
  check (case target_kind
    when 'asset' then target_asset_id is not null and target_asset_type_id is null and target_location_id is null
    when 'asset_type_in_location' then target_asset_id is null and target_asset_type_id is not null and target_location_id is not null
    when 'location' then target_asset_id is null and target_asset_type_id is null and target_location_id is not null
  end)
);

-- location has no (id, organisation_id) key yet; add it so schedules and work orders can use one.
alter table location add constraint location_id_organisation_key unique (id, organisation_id);
alter table pm_schedule add foreign key (target_location_id, organisation_id) references location (id, organisation_id);

-- ---------------------------------------------------------------------------
-- Work orders
-- ---------------------------------------------------------------------------

create type wo_status as enum ('requested','approved','scheduled','in_progress','on_hold',
                               'completed','verified','closed','cancelled');

-- Work order numbers per organisation and year: WO-2026-000123.
create table wo_number_seq (
  organisation_id uuid not null references organisation,
  year int not null,
  last_value int not null default 0,
  primary key (organisation_id, year)
);
alter table wo_number_seq enable row level security;  -- no policies: written by next_wo_number() only
create policy wo_number_seq_read on wo_number_seq for select using (organisation_id in (select auth_org_ids()));

create function next_wo_number(p_org uuid) returns text
language sql security definer set search_path = public as $$
  insert into wo_number_seq as s (organisation_id, year, last_value)
  values (p_org, extract(year from now() at time zone 'Asia/Dubai')::int, 1)
  on conflict (organisation_id, year) do update set last_value = s.last_value + 1
  returning 'WO-' || year || '-' || lpad(last_value::text, 6, '0')
$$;
revoke execute on function next_wo_number(uuid) from public, anon, authenticated;

create table work_order (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  number text not null,                  -- WO-2026-000123 (assigned on insert)
  site_id uuid not null references site,
  location_id uuid references location,
  template_id uuid references wo_template,
  pm_schedule_id uuid references pm_schedule,
  source text not null                   -- pm, request, observation, alert, manual
    check (source in ('pm', 'request', 'observation', 'alert', 'manual')),
  source_ref uuid,                       -- observation_id or alert_id
  wo_type text not null check (wo_type in ('preventive', 'reactive', 'inspection', 'project')),
  title text not null, description text,
  priority text not null default 'P3' check (priority in ('P1', 'P2', 'P3', 'P4')),
  status wo_status not null,
  due_at timestamptz,
  planned_start timestamptz, planned_end timestamptz,
  assignee_user_id uuid references auth.users, team_id uuid references team,
  sop_id uuid references sop,            -- version pinned at dispatch
  est_minutes int check (est_minutes > 0), actual_minutes int check (actual_minutes >= 0),
  materials jsonb not null default '[]', -- [{"item":"mulch","qty":2,"unit":"m3"}]
  completion_notes text,
  geom geometry(Point,4326),
  client_uuid uuid unique,               -- offline idempotency
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, number),
  unique (id, organisation_id),
  foreign key (site_id, organisation_id) references site (id, organisation_id),
  foreign key (location_id, organisation_id) references location (id, organisation_id),
  foreign key (template_id, organisation_id) references wo_template (id, organisation_id),
  foreign key (pm_schedule_id, organisation_id) references pm_schedule (id, organisation_id),
  foreign key (team_id, organisation_id) references team (id, organisation_id),
  foreign key (sop_id, organisation_id) references sop (id, organisation_id),
  check (jsonb_typeof(materials) = 'array'),
  check (planned_end is null or planned_start is null or planned_end >= planned_start)
);
create index on work_order (organisation_id, status);
create index on work_order (assignee_user_id) where assignee_user_id is not null;
create index on work_order (team_id) where team_id is not null;
create index on work_order (pm_schedule_id, due_at);
create index on work_order (planned_start);
create index on work_order using gist (geom);

create table work_order_asset (
  organisation_id uuid not null references organisation,
  work_order_id uuid references work_order on delete cascade,
  asset_id uuid references asset,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  primary key (work_order_id, asset_id),
  foreign key (work_order_id, organisation_id) references work_order (id, organisation_id) on delete cascade,
  foreign key (asset_id, organisation_id) references asset (id, organisation_id)
);
create index on work_order_asset (asset_id);

-- Immutable history of status changes (FR-WO-07). Written only by wo_transition (task 2.2).
create table work_order_event (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  work_order_id uuid not null references work_order,
  from_status wo_status, to_status wo_status not null,
  note text, geom geometry(Point,4326),
  actor uuid not null references auth.users, at timestamptz not null default now(),
  client_uuid uuid unique,
  foreign key (work_order_id, organisation_id) references work_order (id, organisation_id)
);
create index on work_order_event (work_order_id, at);

create table sop_response (
  organisation_id uuid not null references organisation,
  work_order_id uuid references work_order on delete cascade,
  sop_step_id uuid references sop_step,
  value jsonb, media_id uuid references media,
  answered_by uuid default auth.uid() references auth.users, answered_at timestamptz not null default now(),
  primary key (work_order_id, sop_step_id),
  foreign key (work_order_id, organisation_id) references work_order (id, organisation_id) on delete cascade,
  foreign key (sop_step_id, organisation_id) references sop_step (id, organisation_id)
);

-- media.work_order_id now has a table to point at.
alter table media add foreign key (work_order_id) references work_order;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger sop_updated_at before update on sop for each row execute function set_updated_at();
create trigger sop_step_updated_at before update on sop_step for each row execute function set_updated_at();
create trigger wo_template_updated_at before update on wo_template for each row execute function set_updated_at();
create trigger pm_schedule_updated_at before update on pm_schedule for each row execute function set_updated_at();
create trigger work_order_updated_at before update on work_order for each row execute function set_updated_at();

-- DATA_MODEL section 9: sop and pm_schedule are audited.
create trigger sop_audit after insert or update or delete on sop for each row execute function audit_row();
create trigger pm_schedule_audit after insert or update or delete on pm_schedule for each row execute function audit_row();

-- Number on insert, and status changes only through wo_transition (CLAUDE.md rule 4): the
-- function sets app.wo_transition for its own update; any other status change is refused.
create function work_order_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      new.number := next_wo_number(new.organisation_id);
    end if;
  elsif new.status is distinct from old.status
        and coalesce(current_setting('app.wo_transition', true), '') <> 'on' then
    raise exception 'work order status changes only through wo_transition()' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger work_order_before_write before insert or update on work_order
  for each row execute function work_order_before_write();

-- next_wo_number is security definer and not callable by clients; the insert trigger runs it.
alter function work_order_before_write() security definer;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- SOPs, templates and schedules: members read; managers write (SRS roles: catalogues, schedules, SOPs).
alter table sop enable row level security;
create policy sop_read on sop for select using (organisation_id in (select auth_org_ids()));
create policy sop_write on sop for all using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

alter table sop_step enable row level security;
create policy sop_step_read on sop_step for select using (organisation_id in (select auth_org_ids()));
create policy sop_step_write on sop_step for all using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

alter table wo_template enable row level security;
create policy wo_template_read on wo_template for select using (organisation_id in (select auth_org_ids()));
create policy wo_template_write on wo_template for all using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

alter table pm_schedule enable row level security;
create policy pm_schedule_read on pm_schedule for select using (organisation_id in (select auth_org_ids()));
create policy pm_schedule_write on pm_schedule for all using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

-- Whether the caller works on this job: assignee, or member of its team.
create function wo_is_mine(p_org uuid, p_assignee uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_assignee = auth.uid()
    or (p_team is not null and exists (select 1 from membership m
          where m.organisation_id = p_org and m.user_id = auth.uid() and m.active and m.team_id = p_team)))
$$;
revoke execute on function wo_is_mine(uuid, uuid, uuid) from public;
grant execute on function wo_is_mine(uuid, uuid, uuid) to anon, authenticated;

alter table work_order enable row level security;
create policy work_order_read on work_order for select using (organisation_id in (select auth_org_ids()));
-- Any member raises a request (FR-WO-06); planners may create work in any status.
create policy work_order_insert on work_order for insert with check (
  organisation_id in (select auth_org_ids())
  and (status = 'requested' or has_any_role(organisation_id, array['manager', 'field_manager'])));
-- Planners edit any work order; the assignee or team edits their own (notes, minutes, materials).
create policy work_order_update on work_order for update
  using (has_any_role(organisation_id, array['manager', 'field_manager'])
         or wo_is_mine(organisation_id, assignee_user_id, team_id))
  with check (has_any_role(organisation_id, array['manager', 'field_manager'])
              or wo_is_mine(organisation_id, assignee_user_id, team_id));
create policy work_order_delete on work_order for delete using (has_role(organisation_id, 'manager'));

alter table work_order_asset enable row level security;
create policy work_order_asset_read on work_order_asset for select using (organisation_id in (select auth_org_ids()));
create policy work_order_asset_write on work_order_asset for all
  using (has_any_role(organisation_id, array['manager', 'field_manager'])
         or exists (select 1 from work_order w where w.id = work_order_id
                    and (w.created_by = auth.uid() or wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id))))
  with check (has_any_role(organisation_id, array['manager', 'field_manager'])
              or exists (select 1 from work_order w where w.id = work_order_id
                         and (w.created_by = auth.uid() or wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id))));

-- Events: read-only for clients (no insert, update or delete policies).
alter table work_order_event enable row level security;
create policy work_order_event_read on work_order_event for select using (organisation_id in (select auth_org_ids()));

-- SOP answers: by the people doing the job, or a planner.
alter table sop_response enable row level security;
create policy sop_response_read on sop_response for select using (organisation_id in (select auth_org_ids()));
create policy sop_response_write on sop_response for all
  using (has_any_role(organisation_id, array['manager', 'field_manager'])
         or exists (select 1 from work_order w where w.id = work_order_id and wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id)))
  with check (has_any_role(organisation_id, array['manager', 'field_manager'])
              or exists (select 1 from work_order w where w.id = work_order_id and wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id)));
