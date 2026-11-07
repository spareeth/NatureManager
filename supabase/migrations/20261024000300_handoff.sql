-- Task 2.11: hand-off of approved item requests (FR-REQ-06, 07; docs/PROCUREMENT_HANDOFF.md section 4).
-- Export (CSV/XLSX download) and pull API both take approved, unsent requests from one place, mark
-- them sent with a batch id through ir_system_transition(), and mark their integration_outbox rows
-- delivered, all in one transaction: nothing is lost or sent twice.

create extension if not exists pgcrypto with schema extensions;

create table integration_receiver (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisation,
  name text not null,                    -- e.g. ECD procurement
  channel text not null check (channel in ('export_email', 'pull_api', 'webhook')),
  config jsonb not null default '{}',    -- email address, webhook url; secrets never stored here
  api_key_hash text,                     -- sha256 hex of the API key; the key is shown once
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (api_key_hash)
);
create trigger integration_receiver_updated_at before update on integration_receiver
  for each row execute function set_updated_at();
alter table integration_receiver enable row level security;
create policy integration_receiver_rw on integration_receiver for all
  using (has_role(organisation_id, 'manager')) with check (has_role(organisation_id, 'manager'));
-- The key hash is never read back by clients: table-level select is replaced by the other columns.
revoke select on integration_receiver from authenticated, anon;
grant select (id, organisation_id, name, channel, config, active, created_at, created_by, updated_at)
  on integration_receiver to authenticated, anon;

create index on item_request (organisation_id, sent_batch_id);

-- ---------------------------------------------------------------------------
-- System transitions
-- ---------------------------------------------------------------------------

-- Status change by the hand-off (no person checks: callers are the reviewed functions below).
-- Follows ir_transition_rule, writes item_request_event with actor_system. Not callable by clients.
create function ir_system_transition(p_ir uuid, p_to item_request_status, p_note text, p_actor_system text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r item_request;
  rule ir_transition_rule;
begin
  select * into r from item_request where id = p_ir for update;
  if not found then
    raise exception 'item request % not found', p_ir using errcode = 'P0002';
  end if;
  select * into rule from ir_transition_rule where from_status = r.status and to_status = p_to;
  if not found then
    raise exception 'transition % -> % is not allowed', r.status, p_to using errcode = '22023';
  end if;
  if rule.note_required and coalesce(trim(p_note), '') = '' then
    raise exception 'a reason is required for % -> %', r.status, p_to using errcode = '22023';
  end if;
  perform set_config('app.ir_transition', 'on', true);
  update item_request set status = p_to where id = p_ir;
  perform set_config('app.ir_transition', '', true);
  insert into item_request_event (organisation_id, item_request_id, from_status, to_status, note, actor, actor_system)
  values (r.organisation_id, p_ir, r.status, p_to, nullif(trim(p_note), ''), auth.uid(), p_actor_system);
end
$$;
revoke execute on function ir_system_transition(uuid, item_request_status, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Export rows (line format v1) and batches
-- ---------------------------------------------------------------------------

-- One row per request line in the PROCUREMENT_HANDOFF line format, grouped by category. With p_batch:
-- the lines of that batch (re-download); without: approved lines not yet sent (preview).
create function ir_export_rows(p_org uuid, p_batch uuid default null)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'batch_id', r.sent_batch_id,
    'request_number', r.number, 'line_no', li.line_no, 'organisation', o.slug, 'site_code', s.code,
    'location_code', l.code, 'reason', li.reason, 'category', coalesce(i.category, 'other'),
    'item_code', i.code, 'external_code', i.external_code, 'description', li.description,
    'quantity', li.quantity, 'unit', li.unit, 'needed_by', r.needed_by,
    'est_unit_cost_aed', case when coalesce(li.currency, 'AED') = 'AED' then li.est_unit_cost end,
    'linked_asset_tag', a.tag_code, 'linked_work_order', w.number,
    'requested_by', rq.display_name, 'approved_by', ap.display_name, 'approved_at', r.approved_at)
    order by coalesce(i.category, 'other'), r.number, li.line_no), '[]'::jsonb)
  from item_request r
  join organisation o on o.id = r.organisation_id
  join site s on s.id = r.site_id
  join item_request_line li on li.item_request_id = r.id
  left join location l on l.id = r.location_id
  left join item i on i.id = li.item_id
  left join asset a on a.id = li.asset_id
  left join work_order w on w.id = r.work_order_id
  left join membership rq on rq.user_id = r.requested_by and rq.organisation_id = r.organisation_id
  left join membership ap on ap.user_id = r.approved_by and ap.organisation_id = r.organisation_id
  where r.organisation_id = p_org
    and case when p_batch is null then r.status = 'approved' and r.sent_batch_id is null
             else r.sent_batch_id = p_batch end
$$;

-- Mark the given approved requests sent in one new batch; mark their outbox rows delivered.
create function ir_send_batch(p_org uuid, p_ids uuid[], p_channel text, p_actor_system text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  batch uuid := gen_random_uuid();
  rid uuid;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then
    return null;
  end if;
  foreach rid in array p_ids loop
    perform ir_system_transition(rid, 'sent', 'batch ' || batch, p_actor_system);
  end loop;
  update item_request set sent_batch_id = batch where id = any(p_ids) and organisation_id = p_org;
  update integration_outbox
     set delivered_at = now(), channel = p_channel, attempts = attempts + 1
   where organisation_id = p_org and delivered_at is null and topic = 'item_request.approved'
     and (payload ->> 'request_id')::uuid = any(p_ids);
  return batch;
end
$$;
revoke execute on function ir_send_batch(uuid, uuid[], text, text) from public, anon, authenticated;

-- Export (FR-REQ-06): managers take every approved, unsent line of the organisation as one batch.
-- Returns {batch_id, rows}; rows empty and batch_id null when nothing is waiting.
create function ir_export(p_org uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  batch uuid;
begin
  if not has_role(p_org, 'manager') then
    raise exception 'only managers export item requests' using errcode = '42501';
  end if;
  select array_agg(id order by number) into ids from item_request
   where organisation_id = p_org and status = 'approved' and sent_batch_id is null;
  -- lock, so a pull at the same moment cannot take the same requests
  perform 1 from item_request where id = any(ids) for update;
  batch := ir_send_batch(p_org, ids, 'export', 'export');
  return jsonb_build_object('batch_id', batch,
                            'rows', case when batch is null then '[]'::jsonb else ir_export_rows(p_org, batch) end);
end
$$;

-- Earlier batches, newest first, for re-downloading a file.
create function ir_batches(p_org uuid)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(b order by b.sent_at desc), '[]'::jsonb) from (
    select r.sent_batch_id as batch_id,
           min(e.at) as sent_at,
           min(e.actor_system) as channel,
           count(distinct r.id) as requests,
           (select count(*) from item_request_line li join item_request r2 on r2.id = li.item_request_id
             where r2.sent_batch_id = r.sent_batch_id) as lines
    from item_request r
    join item_request_event e on e.item_request_id = r.id and e.to_status = 'sent'
    where r.organisation_id = p_org and r.sent_batch_id is not null
    group by r.sent_batch_id
  ) b
$$;

-- ---------------------------------------------------------------------------
-- Receivers and the pull API (FR-REQ-07)
-- ---------------------------------------------------------------------------

-- New pull API receiver; returns the API key once (only its hash is kept). Managers only (RLS).
create function receiver_create(p_org uuid, p_name text)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare
  key text := 'tgk_' || encode(gen_random_bytes(24), 'hex');
  rid uuid;
begin
  insert into integration_receiver (organisation_id, name, channel, api_key_hash)
  values (p_org, p_name, 'pull_api', encode(digest(key, 'sha256'), 'hex'))
  returning id into rid;
  return jsonb_build_object('id', rid, 'api_key', key);
end
$$;

-- New key for a receiver (the old one stops working at once).
create function receiver_rotate_key(p_receiver uuid)
returns text language plpgsql set search_path = public, extensions as $$
declare key text := 'tgk_' || encode(gen_random_bytes(24), 'hex');
begin
  update integration_receiver set api_key_hash = encode(digest(key, 'sha256'), 'hex') where id = p_receiver;
  if not found then
    raise exception 'receiver not found' using errcode = 'P0002';
  end if;
  return key;
end
$$;

-- The receiver an API key belongs to (active pull_api receivers only).
create function api_receiver(p_key text) returns integration_receiver
language plpgsql stable security definer set search_path = public, extensions as $$
declare rcv integration_receiver;
begin
  select * into rcv from integration_receiver
   where api_key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active and channel = 'pull_api';
  if not found then
    raise exception 'invalid API key' using errcode = '28000';
  end if;
  return rcv;
end
$$;
revoke execute on function api_receiver(text) from public, anon, authenticated;

-- GET /api/v1/item-requests?status=approved|sent&since=...
--   approved: the approved, unsent requests of the receiver's organisation, taken as one batch and
--             marked sent (PROCUREMENT_HANDOFF: approved to sent when pulled);
--   sent:     requests sent and not yet acknowledged (safe to read again).
-- Each request in the payload format of ir_payload(), plus status.
create function api_item_requests(p_key text, p_status text default 'approved', p_since timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rcv integration_receiver := api_receiver(p_key);
  ids uuid[];
  batch uuid;
begin
  if p_status not in ('approved', 'sent') then
    raise exception 'status must be approved or sent' using errcode = '22023';
  end if;
  if p_status = 'approved' then
    select array_agg(id order by number) into ids from item_request
     where organisation_id = rcv.organisation_id and status = 'approved' and sent_batch_id is null
       and (p_since is null or approved_at >= p_since);
    perform 1 from item_request where id = any(ids) for update;
    batch := ir_send_batch(rcv.organisation_id, ids, 'pull_api', 'pull_api: ' || rcv.name);
  else
    select array_agg(id order by number) into ids from item_request
     where organisation_id = rcv.organisation_id and status = 'sent'
       and (p_since is null or approved_at >= p_since);
  end if;
  return jsonb_build_object(
    'batch_id', batch,
    'item_requests', coalesce((select jsonb_agg(ir_payload(r.id) || jsonb_build_object('status', r.status,
                                 'batch_id', r.sent_batch_id) order by r.number)
                               from item_request r where r.id = any(ids)), '[]'::jsonb));
end
$$;

-- POST /api/v1/item-requests/{id or number}/ack  {external_ref, status, note}
-- status: acknowledged (default), rejected_by_receiver (note required) or fulfilled (after acknowledged).
create function api_ack(p_key text, p_request text, p_external_ref text, p_status text default 'acknowledged',
                        p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rcv integration_receiver := api_receiver(p_key);
  r item_request;
begin
  if p_status not in ('acknowledged', 'rejected_by_receiver', 'fulfilled') then
    raise exception 'status must be acknowledged, rejected_by_receiver or fulfilled' using errcode = '22023';
  end if;
  select * into r from item_request
   where organisation_id = rcv.organisation_id
     and (number = p_request or id::text = p_request);
  if not found then
    raise exception 'item request % not found', p_request using errcode = 'P0002';
  end if;
  -- replay of the same acknowledgement: nothing changes
  if r.status::text = p_status and r.external_ref is not distinct from coalesce(p_external_ref, r.external_ref) then
    return jsonb_build_object('request_number', r.number, 'status', r.status, 'external_ref', r.external_ref, 'replayed', true);
  end if;
  perform ir_system_transition(r.id, p_status::item_request_status, p_note, 'pull_api: ' || rcv.name);
  if p_external_ref is not null then
    update item_request set external_ref = p_external_ref where id = r.id;
  end if;
  select * into r from item_request where id = r.id;
  return jsonb_build_object('request_number', r.number, 'status', r.status, 'external_ref', r.external_ref, 'replayed', false);
end
$$;

-- Grants: the pull API is called with the anon key plus the receiver's API key (checked inside).
revoke execute on function ir_export_rows(uuid, uuid) from public, anon;
revoke execute on function ir_export(uuid) from public, anon;
revoke execute on function ir_batches(uuid) from public, anon;
revoke execute on function receiver_create(uuid, text) from public, anon;
revoke execute on function receiver_rotate_key(uuid) from public, anon;
revoke execute on function api_item_requests(text, text, timestamptz) from public;
revoke execute on function api_ack(text, text, text, text, text) from public;
grant execute on function ir_export_rows(uuid, uuid) to authenticated;
grant execute on function ir_export(uuid) to authenticated;
grant execute on function ir_batches(uuid) to authenticated;
grant execute on function receiver_create(uuid, text) to authenticated;
grant execute on function receiver_rotate_key(uuid) to authenticated;
grant execute on function api_item_requests(text, text, timestamptz) to anon, authenticated;
grant execute on function api_ack(text, text, text, text, text) to anon, authenticated;
