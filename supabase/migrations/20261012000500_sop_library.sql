-- Task 2.5: SOP library with versioning and approval (FR-SOP-01..05).

-- Approved and retired SOP versions are read-only, so a work order pinned to a version always
-- shows exactly what it said (FR-SOP-02). Only drafts are edited; sop_approve() and
-- sop_new_version() move versions on. The status change itself is allowed through app.sop_status.
-- Applies to signed-in users; system work without a user (seed, imports) is not limited.
create function sop_guard() returns trigger
language plpgsql set search_path = public as $$
declare st text;
begin
  -- System work (seed, imports, migrations) runs without a signed-in user and is not limited.
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'sop' then
    if tg_op = 'UPDATE' and old.status <> 'draft' then
      if coalesce(current_setting('app.sop_status', true), '') = 'on'
         and (to_jsonb(new) - array['status', 'approved_by', 'approved_at', 'updated_at'])
             = (to_jsonb(old) - array['status', 'approved_by', 'approved_at', 'updated_at']) then
        return new;
      end if;
      raise exception 'SOP % v% is %; create a new version to change it', old.code, old.version, old.status using errcode = '42501';
    end if;
    if tg_op = 'DELETE' and old.status <> 'draft' then
      raise exception 'only draft SOP versions can be deleted' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and new.status <> 'draft' and coalesce(current_setting('app.sop_status', true), '') <> 'on' then
      raise exception 'new SOP versions start as drafts' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- sop_step: the parent version must be a draft (cascading deletes of a draft are fine)
  select status into st from sop where id = case when tg_op = 'DELETE' then old.sop_id else new.sop_id end;
  if st is not null and st <> 'draft' then
    raise exception 'steps of an approved or retired SOP cannot change; create a new version' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
create trigger sop_guard before insert or update or delete on sop for each row execute function sop_guard();
create trigger sop_step_guard before insert or update or delete on sop_step for each row execute function sop_guard();

-- Next draft version of an SOP, with its steps copied. Managers only (RLS on sop and sop_step).
create function sop_new_version(p_sop uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  src sop;
  new_id uuid;
begin
  select * into src from sop where id = p_sop;
  if not found then
    raise exception 'SOP % not found', p_sop using errcode = 'P0002';
  end if;
  if exists (select 1 from sop where organisation_id = src.organisation_id and code = src.code and status = 'draft') then
    raise exception 'SOP % already has a draft version', src.code using errcode = '23505';
  end if;
  insert into sop (organisation_id, code, version, title, purpose, ppe, hazards, status)
  select src.organisation_id, src.code, max(version) + 1, src.title, src.purpose, src.ppe, src.hazards, 'draft'
  from sop where organisation_id = src.organisation_id and code = src.code
  returning id into new_id;
  insert into sop_step (organisation_id, sop_id, seq, text, input_type, choices, unit, required, media_path)
  select organisation_id, new_id, seq, text, input_type, choices, unit, required, media_path from sop_step where sop_id = p_sop;
  return new_id;
end
$$;

-- Approve a draft (FR-SOP-05, managers only) and retire the previously approved version of the same
-- code. Work orders keep the version they were pinned to.
create function sop_approve(p_sop uuid) returns void
language plpgsql set search_path = public as $$
declare s sop;
begin
  select * into s from sop where id = p_sop;
  if not found then
    raise exception 'SOP % not found', p_sop using errcode = 'P0002';
  end if;
  if not has_role(s.organisation_id, 'manager') then
    raise exception 'only managers approve SOPs' using errcode = '42501';
  end if;
  if s.status <> 'draft' then
    raise exception 'only a draft can be approved' using errcode = '22023';
  end if;
  if not exists (select 1 from sop_step where sop_id = p_sop) then
    raise exception 'an SOP needs at least one step' using errcode = '22023';
  end if;
  perform set_config('app.sop_status', 'on', true);
  update sop set status = 'retired' where organisation_id = s.organisation_id and code = s.code and status = 'approved';
  update sop set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_sop;
  perform set_config('app.sop_status', '', true);
end
$$;

-- Reorder steps of a draft: p_steps is the step ids in their new order.
create function sop_reorder(p_sop uuid, p_steps uuid[]) returns void
language plpgsql set search_path = public as $$
begin
  if (select count(*) from sop_step where sop_id = p_sop) <> cardinality(p_steps)
     or exists (select 1 from unnest(p_steps) s where s not in (select id from sop_step where sop_id = p_sop)) then
    raise exception 'the list must contain every step of the SOP once' using errcode = '22023';
  end if;
  -- two passes so the unique (sop_id, seq) never collides
  update sop_step set seq = seq + 10000 where sop_id = p_sop;
  update sop_step st set seq = o.ord from unnest(p_steps) with ordinality o(id, ord) where st.id = o.id;
end
$$;

-- Library listing: one row per SOP code with its current (approved) and draft versions.
create function sop_library(p_org uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.code), '[]'::jsonb) from (
    select s.code,
           (select jsonb_build_object('id', a.id, 'version', a.version, 'title', a.title, 'approved_at', a.approved_at,
                                      'steps', (select count(*) from sop_step where sop_id = a.id))
            from sop a where a.organisation_id = p_org and a.code = s.code and a.status = 'approved') as current,
           (select jsonb_build_object('id', d.id, 'version', d.version, 'title', d.title,
                                      'steps', (select count(*) from sop_step where sop_id = d.id))
            from sop d where d.organisation_id = p_org and d.code = s.code and d.status = 'draft') as draft,
           (select count(*) from sop r where r.organisation_id = p_org and r.code = s.code and r.status = 'retired') as retired,
           (select count(*) from wo_template t join sop ts on ts.id = t.sop_id where t.organisation_id = p_org and ts.code = s.code) as templates
    from (select distinct code from sop where organisation_id = p_org) s
  ) x
$$;

revoke execute on function sop_new_version(uuid) from public, anon;
revoke execute on function sop_approve(uuid) from public, anon;
revoke execute on function sop_reorder(uuid, uuid[]) from public, anon;
revoke execute on function sop_library(uuid) from public, anon;
grant execute on function sop_new_version(uuid) to authenticated;
grant execute on function sop_approve(uuid) to authenticated;
grant execute on function sop_reorder(uuid, uuid[]) to authenticated;
grant execute on function sop_library(uuid) to authenticated;
