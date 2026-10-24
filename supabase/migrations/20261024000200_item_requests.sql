-- Task 2.10: item catalogue and item requests (FR-REQ-01..05, docs/PROCUREMENT_HANDOFF.md).
-- Same pattern as work orders: numbering per organisation and year, status only through
-- ir_transition() (which writes item_request_event), composite keys inside one organisation.
-- item_request_line and item_request_event carry organisation_id (CLAUDE.md rule 1).
-- requested_by is null only for requests drafted by the system with no signed-in user
-- (decision 24 Oct 2026, like work_order_event.actor).

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table item (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  code text not null,
  name text not null,
  category text not null check (category in ('plant', 'irrigation', 'soil_amendment', 'fertiliser',
    'pest_control', 'hardware', 'signage', 'tools', 'ppe', 'other')),
  unit text not null check (unit in ('each', 'm', 'm2', 'm3', 'kg', 'L', 'bag')),
  taxon_id uuid references taxon,
  spec jsonb not null default '{}',
  external_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, code),
  unique (id, organisation_id)
);
create index on item (organisation_id, taxon_id) where taxon_id is not null;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

create type item_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'sent',
  'acknowledged', 'rejected_by_receiver', 'fulfilled', 'cancelled');

create table ir_number_seq (
  organisation_id uuid not null references organisation,
  year int not null,
  last_value int not null default 0,
  primary key (organisation_id, year)
);
alter table ir_number_seq enable row level security;  -- written by next_ir_number() only
create policy ir_number_seq_read on ir_number_seq for select using (organisation_id in (select auth_org_ids()));

create function next_ir_number(p_org uuid) returns text
language sql security definer set search_path = public as $$
  insert into ir_number_seq as s (organisation_id, year, last_value)
  values (p_org, extract(year from now() at time zone 'Asia/Dubai')::int, 1)
  on conflict (organisation_id, year) do update set last_value = s.last_value + 1
  returning 'IR-' || year || '-' || lpad(last_value::text, 6, '0')
$$;
revoke execute on function next_ir_number(uuid) from public, anon, authenticated;

create table item_request (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  number text not null,                  -- IR-2026-000042 (assigned on insert)
  site_id uuid not null references site,
  location_id uuid references location,
  source text not null check (source in ('work_order', 'inspection', 'plant_death', 'manager', 'pm_template')),
  work_order_id uuid,
  status item_request_status not null default 'draft',
  needed_by date,
  requested_by uuid default auth.uid() references auth.users,
  approved_by uuid references auth.users, approved_at timestamptz,
  external_ref text,
  sent_batch_id uuid,
  notes text,
  client_uuid uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, number),
  unique (id, organisation_id),
  -- deleting a work order or location keeps the request and clears the link
  foreign key (work_order_id, organisation_id) references work_order (id, organisation_id) on delete set null (work_order_id),
  foreign key (location_id, organisation_id) references location (id, organisation_id) on delete set null (location_id),
  check (requested_by is not null or source in ('plant_death', 'inspection'))
);
create index on item_request (organisation_id, status);
create index on item_request (work_order_id);

create table item_request_line (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  item_request_id uuid not null references item_request on delete cascade,
  line_no int not null check (line_no >= 1),
  item_id uuid,
  description text not null check (length(trim(description)) > 0),
  reason text not null check (reason in ('maintain', 'replace', 'procure_new')),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  est_unit_cost numeric check (est_unit_cost >= 0),
  currency text default 'AED',
  asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_request_id, line_no),
  foreign key (item_request_id, organisation_id) references item_request (id, organisation_id) on delete cascade,
  -- deleting an item or asset keeps the line (its description names it) and clears the link
  foreign key (item_id, organisation_id) references item (id, organisation_id) on delete set null (item_id),
  foreign key (asset_id, organisation_id) references asset (id, organisation_id) on delete set null (asset_id)
);
create index on item_request_line (asset_id);

create table item_request_event (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  item_request_id uuid not null,
  from_status item_request_status, to_status item_request_status not null,
  note text,
  actor uuid references auth.users,      -- null for system events
  actor_system text,                     -- e.g. export, pull_api, asset_trigger
  at timestamptz not null default now(),
  foreign key (item_request_id, organisation_id) references item_request (id, organisation_id) on delete cascade
);
create index on item_request_event (item_request_id, at);

-- Transactional outbox (PROCUREMENT_HANDOFF section 4): written in the same transaction as the
-- approved transition; read by the hand-off channels (task 2.11).
create table integration_outbox (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references organisation,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz, channel text, attempts int not null default 0, last_error text
);
create index on integration_outbox (organisation_id, delivered_at);

-- Lifecycle (PROCUREMENT_HANDOFF section 3). Shared reference data, the same for every organisation.
-- 'requester' means the person who raised the request. system_only rows are moved by the hand-off
-- (export, pull API) or an asset trigger, never by a client.
create table ir_transition_rule (
  from_status item_request_status not null,
  to_status item_request_status not null,
  roles text[] not null,
  requester_allowed boolean not null,
  note_required boolean not null default false,
  system_only boolean not null default false,
  primary key (from_status, to_status)
);
insert into ir_transition_rule values
  ('draft',        'submitted',            '{manager,field_manager}', true,  false, false),
  ('draft',        'cancelled',            '{manager,field_manager}', true,  false, false),
  ('submitted',    'approved',             '{manager,field_manager}', false, false, false),  -- field manager up to the limit
  ('submitted',    'rejected',             '{manager,field_manager}', false, true,  false),
  ('submitted',    'cancelled',            '{manager,field_manager}', true,  false, false),
  ('approved',     'sent',                 '{}',                      false, false, true),
  ('sent',         'acknowledged',         '{manager}',               false, false, false),
  ('sent',         'rejected_by_receiver', '{manager}',               false, true,  false),
  ('acknowledged', 'fulfilled',            '{manager,field_manager}', false, false, false);
alter table ir_transition_rule enable row level security;
create policy ir_transition_rule_read on ir_transition_rule for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger item_updated_at before update on item for each row execute function set_updated_at();
create trigger item_request_updated_at before update on item_request for each row execute function set_updated_at();
create trigger item_request_line_updated_at before update on item_request_line for each row execute function set_updated_at();
create trigger item_audit after insert or update or delete on item for each row execute function audit_row();

-- Numbering on insert; status only through ir_transition(); a new request starts as a draft.
create function item_request_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      new.number := next_ir_number(new.organisation_id);
    end if;
    if new.status <> 'draft' and coalesce(current_setting('app.ir_transition', true), '') <> 'on' then
      raise exception 'item requests start as drafts' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status
        and coalesce(current_setting('app.ir_transition', true), '') <> 'on' then
    raise exception 'item request status changes only through ir_transition()' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger item_request_before_write before insert or update on item_request
  for each row execute function item_request_before_write();

-- Lines change only while the request is a draft (signed-in users; system work is not limited).
create function item_request_line_guard() returns trigger
language plpgsql set search_path = public as $$
declare st item_request_status;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into st from item_request
   where id = case when tg_op = 'DELETE' then old.item_request_id else new.item_request_id end;
  if st is not null and st <> 'draft' then
    raise exception 'lines can change only while the request is a draft (it is %)', st using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger item_request_line_guard before insert or update or delete on item_request_line
  for each row execute function item_request_line_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table item enable row level security;
create policy item_read on item for select using (organisation_id in (select auth_org_ids()));
create policy item_write on item for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));

-- Working roles raise and edit their own requests; planners edit any.
alter table item_request enable row level security;
create policy item_request_read on item_request for select using (organisation_id in (select auth_org_ids()));
create policy item_request_insert on item_request for insert with check (
  has_any_role(organisation_id, array['manager', 'field_manager', 'curator', 'green_team', 'field_engineer'])
  and requested_by = auth.uid());
create policy item_request_update on item_request for update
  using (has_any_role(organisation_id, array['manager', 'field_manager'])
         or (requested_by = auth.uid() and has_any_role(organisation_id, array['curator', 'green_team', 'field_engineer'])))
  with check (has_any_role(organisation_id, array['manager', 'field_manager'])
         or (requested_by = auth.uid() and has_any_role(organisation_id, array['curator', 'green_team', 'field_engineer'])));
create policy item_request_delete on item_request for delete
  using (status = 'draft' and (has_any_role(organisation_id, array['manager', 'field_manager'])
         or (requested_by = auth.uid() and has_any_role(organisation_id, array['curator', 'green_team', 'field_engineer']))));

alter table item_request_line enable row level security;
create policy item_request_line_read on item_request_line for select using (organisation_id in (select auth_org_ids()));
create policy item_request_line_write on item_request_line for all
  using (exists (select 1 from item_request r where r.id = item_request_id
                 and (has_any_role(r.organisation_id, array['manager', 'field_manager'])
                      or (r.requested_by = auth.uid() and has_any_role(r.organisation_id, array['curator', 'green_team', 'field_engineer'])))))
  with check (exists (select 1 from item_request r where r.id = item_request_id
                 and (has_any_role(r.organisation_id, array['manager', 'field_manager'])
                      or (r.requested_by = auth.uid() and has_any_role(r.organisation_id, array['curator', 'green_team', 'field_engineer'])))));

alter table item_request_event enable row level security;   -- written by ir_transition() only
create policy item_request_event_read on item_request_event for select using (organisation_id in (select auth_org_ids()));

alter table integration_outbox enable row level security;   -- written by ir_transition() only
create policy integration_outbox_read on integration_outbox for select using (has_role(organisation_id, 'manager'));

-- ---------------------------------------------------------------------------
-- ir_transition
-- ---------------------------------------------------------------------------

-- Estimated value of a request (lines without a cost count as 0).
create function ir_total(p_ir uuid) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum(quantity * coalesce(est_unit_cost, 0)), 0) from item_request_line where item_request_id = p_ir
$$;

-- The request with its lines, as sent to the receiving system (PROCUREMENT_HANDOFF line format v1).
create function ir_payload(p_ir uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'request_id', r.id, 'request_number', r.number, 'organisation', o.slug, 'site_code', s.code,
    'location_code', l.code, 'source', r.source, 'needed_by', r.needed_by, 'notes', r.notes,
    'linked_work_order', (select number from work_order where id = r.work_order_id),
    'requested_by', (select display_name from membership where user_id = r.requested_by and organisation_id = r.organisation_id),
    'approved_by', (select display_name from membership where user_id = r.approved_by and organisation_id = r.organisation_id),
    'approved_at', r.approved_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'line_no', li.line_no, 'reason', li.reason, 'item_code', i.code, 'external_code', i.external_code,
        'category', i.category, 'description', li.description, 'quantity', li.quantity, 'unit', li.unit,
        'est_unit_cost_aed', case when coalesce(li.currency, 'AED') = 'AED' then li.est_unit_cost end,
        'linked_asset_tag', a.tag_code) order by li.line_no)
      from item_request_line li left join item i on i.id = li.item_id left join asset a on a.id = li.asset_id
      where li.item_request_id = r.id), '[]'::jsonb))
  from item_request r join organisation o on o.id = r.organisation_id join site s on s.id = r.site_id
  left join location l on l.id = r.location_id
  where r.id = p_ir
$$;

-- The only way to change item_request.status. Security definer like wo_transition: it checks
-- membership and roles itself and writes the event (and the outbox row on approval).
-- p_system names a system actor (export, pull_api); only callable inside the database, never by clients.
create function ir_transition(p_ir uuid, p_to item_request_status, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r item_request;
  rule ir_transition_rule;
  me uuid := auth.uid();
  limit_aed numeric;
  ev item_request_event;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into r from item_request where id = p_ir for update;
  if not found or r.organisation_id not in (select auth_org_ids()) then
    raise exception 'item request % not found', p_ir using errcode = 'P0002';
  end if;
  select * into rule from ir_transition_rule where from_status = r.status and to_status = p_to;
  if not found then
    raise exception 'transition % -> % is not allowed', r.status, p_to using errcode = '22023';
  end if;
  if rule.system_only then
    raise exception '% -> % is done by the hand-off, not by hand', r.status, p_to using errcode = '42501';
  end if;
  if not (has_any_role(r.organisation_id, rule.roles)
          or (rule.requester_allowed and r.requested_by = me
              and has_any_role(r.organisation_id, array['curator', 'green_team', 'field_engineer']))) then
    raise exception 'your role may not move an item request from % to %', r.status, p_to using errcode = '42501';
  end if;
  if rule.note_required and coalesce(trim(p_note), '') = '' then
    raise exception 'a reason is required for % -> %', r.status, p_to using errcode = '22023';
  end if;
  if p_to = 'submitted' and not exists (select 1 from item_request_line where item_request_id = p_ir) then
    raise exception 'add at least one line before submitting' using errcode = '22023';
  end if;
  if p_to = 'approved' then
    if r.requested_by = me then
      raise exception 'you cannot approve your own request' using errcode = '42501';
    end if;
    if not has_role(r.organisation_id, 'manager') then
      -- Field managers approve up to organisation.settings.ir_field_manager_limit_aed (default 0).
      select coalesce((settings ->> 'ir_field_manager_limit_aed')::numeric, 0) into limit_aed
        from organisation where id = r.organisation_id;
      if ir_total(p_ir) > limit_aed then
        raise exception 'estimated value % AED is above the field manager limit of % AED; a manager must approve',
          ir_total(p_ir), limit_aed using errcode = '42501';
      end if;
    end if;
  end if;

  perform set_config('app.ir_transition', 'on', true);
  update item_request
     set status = p_to,
         approved_by = case when p_to = 'approved' then me else approved_by end,
         approved_at = case when p_to = 'approved' then now() else approved_at end
   where id = p_ir;
  perform set_config('app.ir_transition', '', true);

  insert into item_request_event (organisation_id, item_request_id, from_status, to_status, note, actor)
  values (r.organisation_id, p_ir, r.status, p_to, nullif(trim(p_note), ''), me)
  returning * into ev;

  if p_to = 'approved' then
    insert into integration_outbox (organisation_id, topic, payload)
    values (r.organisation_id, 'item_request.approved', ir_payload(p_ir));
  end if;

  return jsonb_build_object('item_request_id', p_ir, 'event_id', ev.id, 'number', r.number,
                            'from', r.status, 'to', p_to);
end
$$;

-- What the signed-in user may do next with a request (for the buttons).
create function ir_allowed_transitions(p_ir uuid)
returns table (to_status item_request_status, note_required boolean)
language sql stable set search_path = public as $$
  select t.to_status, t.note_required
  from item_request r join ir_transition_rule t on t.from_status = r.status
  where r.id = p_ir and not t.system_only
    and (has_any_role(r.organisation_id, t.roles)
         or (t.requester_allowed and r.requested_by = auth.uid()
             and has_any_role(r.organisation_id, array['curator', 'green_team', 'field_engineer'])))
    -- (requested_by is null for system drafts: those can be approved by anyone allowed)
    and not (t.to_status = 'approved' and r.requested_by is not distinct from auth.uid())
  order by t.to_status
$$;

-- ---------------------------------------------------------------------------
-- Plant items from taxa, and replacement drafts from asset changes (FR-REQ-01, 03)
-- ---------------------------------------------------------------------------

-- One active plant item per taxon of the organisation (code PLT-<in-house code>, or from the name).
-- Idempotent: taxa that already have an active plant item are skipped. Managers only (RLS on item).
create function item_generate_plants(p_org uuid) returns int
language plpgsql set search_path = public as $$
declare
  t record;
  base text;
  new_code text;
  n int := 0;
begin
  for t in
    select ot.taxon_id, ot.inhouse_code, tx.scientific_name
    from org_taxon ot join taxon tx on tx.id = ot.taxon_id
    where ot.organisation_id = p_org
      and not exists (select 1 from item i where i.organisation_id = p_org and i.taxon_id = ot.taxon_id
                      and i.category = 'plant' and i.active)
    order by tx.scientific_name
  loop
    base := 'PLT-' || coalesce(upper(t.inhouse_code),
      upper(left(split_part(t.scientific_name, ' ', 1), 4) || left(regexp_replace(split_part(t.scientific_name, ' ', 2), '[^A-Za-z]', '', 'g'), 4)));
    new_code := base;
    if exists (select 1 from item where organisation_id = p_org and item.code = new_code) then
      new_code := base || '-' || left(replace(t.taxon_id::text, '-', ''), 4);
    end if;
    insert into item (organisation_id, code, name, category, unit, taxon_id)
    values (p_org, new_code, t.scientific_name, 'plant', 'each', t.taxon_id);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Asset changes that need a replacement (FR-REQ-03): status dead or removed (source plant_death),
-- condition dropping to 1 or 2, or a built asset going out_of_service (source inspection). One draft
-- per asset while an earlier replacement request for it is still open. Security definer: whoever may
-- edit the asset causes the draft, whatever their item request rights; the draft records them.
create function asset_draft_replacement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  src text;
  ir_id uuid;
  it item;
  label text;
  -- set by the backfill at the end of this migration: treat the current state as a change
  backfill boolean := coalesce(current_setting('app.ir_backfill', true), '') = 'on';
begin
  if new.status in ('dead', 'removed')
     and (tg_op = 'INSERT' or backfill or old.status is distinct from new.status) then
    src := 'plant_death';
  elsif new.status = 'out_of_service' and (tg_op = 'INSERT' or backfill or old.status is distinct from new.status) then
    src := 'inspection';
  elsif new.condition in (1, 2) and (tg_op = 'INSERT' or backfill or old.condition is null or old.condition > 2) then
    src := 'inspection';
  else
    return new;
  end if;
  if exists (select 1 from item_request_line li join item_request r on r.id = li.item_request_id
             where li.asset_id = new.id and li.reason = 'replace'
               and r.status in ('draft', 'submitted', 'approved', 'sent', 'acknowledged')) then
    return new;
  end if;
  if new.taxon_id is not null then
    select * into it from item where organisation_id = new.organisation_id and taxon_id = new.taxon_id
      and category = 'plant' and active order by code limit 1;
  end if;
  label := coalesce((select scientific_name from taxon where id = new.taxon_id), new.name,
                    (select name from asset_type where id = new.asset_type_id), 'Asset');
  insert into item_request (organisation_id, site_id, location_id, source, requested_by, notes)
  values (new.organisation_id, new.site_id, new.location_id, src, auth.uid(),
          case src when 'plant_death' then 'Drafted automatically: ' || new.tag_code || ' recorded ' || new.status
                   else 'Drafted automatically: ' || new.tag_code || ' needs replacement (condition or out of service)' end)
  returning id into ir_id;
  insert into item_request_line (organisation_id, item_request_id, line_no, item_id, description, reason, quantity, unit, asset_id)
  values (new.organisation_id, ir_id, 1, it.id, label || ', replacement for ' || new.tag_code, 'replace',
          greatest(coalesce(new.plant_count, 1), 1), coalesce(it.unit, 'each'), new.id);
  insert into item_request_event (organisation_id, item_request_id, from_status, to_status, note, actor, actor_system)
  values (new.organisation_id, ir_id, null, 'draft', 'drafted from asset ' || new.tag_code, auth.uid(), 'asset_trigger');
  return new;
end
$$;
create trigger asset_draft_replacement after insert or update of status, condition on asset
  for each row execute function asset_draft_replacement();

-- Items needed from a work order on the phone (FR-REQ-04). Idempotent for offline replays: the
-- request is found by p_client_uuid (or the caller's open draft for the job), lines by their id.
-- p_lines: [{"id": uuid, "item_id": uuid|null, "description", "quantity", "unit", "reason", "asset_id"}].
create function ir_add_wo_items(p_wo uuid, p_client_uuid uuid, p_lines jsonb, p_submit boolean default true)
returns jsonb
language plpgsql set search_path = public as $$
declare
  w work_order;
  ir item_request;
  l jsonb;
  next_no int;
begin
  select * into w from work_order where id = p_wo;
  if not found then
    raise exception 'work order % not found', p_wo using errcode = 'P0002';
  end if;
  select * into ir from item_request where client_uuid = p_client_uuid;
  if found and ir.status <> 'draft' then
    return jsonb_build_object('item_request_id', ir.id, 'number', ir.number, 'status', ir.status, 'replayed', true);
  end if;
  if not found then
    select * into ir from item_request
     where work_order_id = p_wo and requested_by = auth.uid() and status = 'draft' order by created_at limit 1;
  end if;
  if not found then
    insert into item_request (organisation_id, site_id, location_id, source, work_order_id, client_uuid)
    values (w.organisation_id, w.site_id, w.location_id, 'work_order', p_wo, p_client_uuid)
    returning * into ir;
  end if;
  select coalesce(max(line_no), 0) into next_no from item_request_line where item_request_id = ir.id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from item_request_line where id = (l ->> 'id')::uuid) then
      next_no := next_no + 1;
      insert into item_request_line (id, organisation_id, item_request_id, line_no, item_id, description, reason,
                                     quantity, unit, asset_id)
      values ((l ->> 'id')::uuid, w.organisation_id, ir.id, next_no, nullif(l ->> 'item_id', '')::uuid,
              l ->> 'description', coalesce(l ->> 'reason', 'maintain'), (l ->> 'quantity')::numeric,
              l ->> 'unit', nullif(l ->> 'asset_id', '')::uuid);
    end if;
  end loop;
  if p_submit then
    perform ir_transition(ir.id, 'submitted', 'from work order ' || w.number);
  end if;
  select * into ir from item_request where id = ir.id;
  return jsonb_build_object('item_request_id', ir.id, 'number', ir.number, 'status', ir.status, 'replayed', false);
end
$$;

-- Lists for the web screens.
create function ir_list(p_site uuid, p_status item_request_status[] default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'number', r.number, 'status', r.status, 'source', r.source, 'needed_by', r.needed_by,
    'created_at', r.created_at, 'location_code', l.code,
    'work_order_number', (select number from work_order where id = r.work_order_id),
    'requested_by_name', (select display_name from membership where user_id = r.requested_by and organisation_id = r.organisation_id),
    'lines', (select count(*) from item_request_line where item_request_id = r.id),
    'reasons', (select coalesce(jsonb_agg(distinct reason), '[]'::jsonb) from item_request_line where item_request_id = r.id),
    'total_aed', ir_total(r.id),
    'summary', (select string_agg(description, '; ' order by line_no) from item_request_line where item_request_id = r.id)
  ) order by r.created_at desc), '[]'::jsonb)
  from item_request r left join location l on l.id = r.location_id
  where r.site_id = p_site and (p_status is null or r.status = any(p_status))
$$;

create function ir_detail(p_ir uuid)
returns jsonb language sql stable set search_path = public as $$
  select to_jsonb(r) || jsonb_build_object(
    'location_code', (select code from location where id = r.location_id),
    'work_order_number', (select number from work_order where id = r.work_order_id),
    'requested_by_name', (select display_name from membership where user_id = r.requested_by and organisation_id = r.organisation_id),
    'approved_by_name', (select display_name from membership where user_id = r.approved_by and organisation_id = r.organisation_id),
    'total_aed', ir_total(r.id),
    'lines', coalesce((select jsonb_agg(to_jsonb(li) || jsonb_build_object('item_code', i.code, 'asset_tag', a.tag_code)
                                        order by li.line_no)
                       from item_request_line li left join item i on i.id = li.item_id left join asset a on a.id = li.asset_id
                       where li.item_request_id = r.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'from', e.from_status, 'to', e.to_status,
                                                            'note', e.note, 'system', e.actor_system, 'by', m.display_name)
                                         order by e.at desc)
                        from item_request_event e left join membership m on m.user_id = e.actor and m.organisation_id = e.organisation_id
                        where e.item_request_id = r.id), '[]'::jsonb))
  from item_request r where r.id = p_ir
$$;

-- Offline pack (task 2.8) now also carries the active item catalogue for adding items on the phone.
create or replace function field_offline_pack(p_site uuid, p_from date, p_to date)
returns jsonb language sql stable set search_path = public, extensions as $$
  with days as (
    select d::date as day from generate_series(p_from, least(p_to, p_from + 6), interval '1 day') d
  ),
  day_lists as (
    select day, field_my_day(p_site, day) as list from days
  ),
  job_ids as (
    select distinct (j ->> 'id')::uuid as id from day_lists, jsonb_array_elements(list) j
  ),
  job_zones as (
    select distinct coalesce(case when l.kind = 'zone' then l.id end, l.parent_id) as zone_id
    from work_order w join job_ids j on j.id = w.id join location l on l.id = w.location_id
  ),
  zone_locations as (
    select l.id from location l join job_zones z on l.id = z.zone_id or l.parent_id = z.zone_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', coalesce((select jsonb_object_agg(day::text, list) from day_lists), '{}'::jsonb),
    'jobs', coalesce((select jsonb_agg(field_job(id)) from job_ids), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'organisation_id', a.organisation_id, 'site_id', a.site_id, 'tag_code', a.tag_code,
        'barcode', a.barcode, 'name', a.name, 'status', a.status, 'location_id', a.location_id,
        'location_code', l.code, 'scientific_name', t.scientific_name,
        'lon', round(st_x(st_pointonsurface(a.geom))::numeric, 7), 'lat', round(st_y(st_pointonsurface(a.geom))::numeric, 7))
        order by a.tag_code)
      from asset a join zone_locations z on z.id = a.location_id
      left join location l on l.id = a.location_id left join taxon t on t.id = a.taxon_id
      where a.site_id = p_site), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'name', i.name,
        'category', i.category, 'unit', i.unit) order by i.category, i.name)
      from item i where i.active and i.organisation_id = (select organisation_id from site where id = p_site)), '[]'::jsonb),
    'bbox', (select jsonb_build_array(round(st_xmin(b)::numeric, 7), round(st_ymin(b)::numeric, 7),
                                      round(st_xmax(b)::numeric, 7), round(st_ymax(b)::numeric, 7))
             from (select st_envelope(boundary) b from site where id = p_site) s))
$$;

-- The job on the phone (task 2.6) now also lists the item requests raised from it.
create or replace function field_job(p_wo uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select wo_detail(w.id) || jsonb_build_object(
    'mine', wo_is_mine(w.organisation_id, w.assignee_user_id, w.team_id),
    'organisation_id', w.organisation_id,
    'sop', (select jsonb_build_object('id', s.id, 'code', s.code, 'version', s.version, 'title', s.title,
                                      'ppe', s.ppe, 'hazards', s.hazards)
            from sop s where s.id = w.sop_id),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
                'id', st.id, 'seq', st.seq, 'text', st.text, 'input_type', st.input_type, 'choices', st.choices,
                'unit', st.unit, 'required', st.required, 'media_path', st.media_path,
                'value', r.value, 'media_id', r.media_id,
                'media_path_answer', (select m.path from media m where m.id = r.media_id)) order by st.seq)
              from sop_step st left join sop_response r on r.work_order_id = w.id and r.sop_step_id = st.id
              where st.sop_id = w.sop_id), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(m.seq order by m.seq) from wo_missing_steps(w.id) m), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'path', m.path, 'caption', m.caption,
                                                            'taken_at', m.taken_at) order by m.created_at)
                        from media m where m.work_order_id = w.id and m.kind = 'photo'), '[]'::jsonb),
    'item_requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'number', r.number, 'status', r.status,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'quantity', li.quantity,
                                                               'unit', li.unit, 'reason', li.reason) order by li.line_no), '[]'::jsonb)
                  from item_request_line li where li.item_request_id = r.id)) order by r.created_at)
      from item_request r where r.work_order_id = w.id), '[]'::jsonb))
  from work_order w where w.id = p_wo
$$;

-- Grants -------------------------------------------------------------------------------------
revoke execute on function ir_total(uuid) from public, anon;
revoke execute on function ir_payload(uuid) from public, anon;
revoke execute on function ir_transition(uuid, item_request_status, text) from public, anon;
revoke execute on function ir_allowed_transitions(uuid) from public, anon;
revoke execute on function item_generate_plants(uuid) from public, anon;
revoke execute on function ir_add_wo_items(uuid, uuid, jsonb, boolean) from public, anon;
revoke execute on function ir_list(uuid, item_request_status[]) from public, anon;
revoke execute on function ir_detail(uuid) from public, anon;
grant execute on function ir_total(uuid) to authenticated;
grant execute on function ir_payload(uuid) to authenticated;
grant execute on function ir_transition(uuid, item_request_status, text) to authenticated;
grant execute on function ir_allowed_transitions(uuid) to authenticated;
grant execute on function item_generate_plants(uuid) to authenticated;
grant execute on function ir_add_wo_items(uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function ir_list(uuid, item_request_status[]) to authenticated;
grant execute on function ir_detail(uuid) to authenticated;

-- Backfill: plant items for every organisation, then drafts for assets already dead, removed, out of
-- service or in condition 1 or 2 (the 9 dead plants from the Hortis import are the first batch).
select item_generate_plants(id) from organisation;
select set_config('app.ir_backfill', 'on', true);
update asset set status = status where status in ('dead', 'removed', 'out_of_service') or condition in (1, 2);
select set_config('app.ir_backfill', '', true);
