-- Task 1.7: taxon search and curator edit of org_taxon with history (FR-TAX-04, FR-TAX-05).
-- Functions are security invoker: RLS decides what the caller sees and may change.

-- Curators read the history of the fields they own (org_taxon). Managers and owners already read
-- all audit rows (task 0.2); other members do not see taxon history.
create policy audit_log_read_org_taxon on audit_log for select
  using (table_name = 'org_taxon' and has_role(organisation_id, 'curator'));

-- Taxa of an organisation (those with an org_taxon row) with search, filters, plant counts,
-- sort and paging. Organisation names (org_taxon.attributes.common_names {"en": [], "ar": []})
-- are searched together with the shared taxon common names.
create function taxon_list(
  p_org uuid,
  p_q text default null,
  p_iucn text default null,
  p_origin text default null,
  p_zone text default null,
  p_code text default null,          -- 'has', 'none', 'proposed'
  p_sort text default 'scientific_name',
  p_desc boolean default false,
  p_limit int default 50,
  p_offset int default 0)
returns jsonb language sql stable set search_path = public as $$
  with q as (select nullif(trim(p_q), '') as s),
  counts as (
    select a.taxon_id, count(*) as plants, count(*) filter (where a.status = 'dead') as dead
    from asset a where a.organisation_id = p_org and a.taxon_id is not null group by a.taxon_id
  ),
  hits as (
    select tx.id, tx.scientific_name, tx.authorship, tx.family, tx.rank,
           coalesce(ot.attributes -> 'common_names' -> 'en' ->> 0, tx.common_names -> 'en' ->> 0) as common_en,
           coalesce(ot.attributes -> 'common_names' -> 'ar' ->> 0, tx.common_names -> 'ar' ->> 0) as common_ar,
           ot.inhouse_code, ot.attributes ->> 'proposed_inhouse_code' as proposed_code,
           ot.iucn_category, ot.origin, ot.protection_level, ot.sensitive, ot.zones_present,
           coalesce(c.plants, 0) as plants, coalesce(c.dead, 0) as dead
    from org_taxon ot
    join taxon tx on tx.id = ot.taxon_id
    left join counts c on c.taxon_id = tx.id
    , q
    where ot.organisation_id = p_org
      and (q.s is null
           or tx.scientific_name ilike '%' || q.s || '%'
           or tx.family ilike '%' || q.s || '%'
           or tx.common_names::text ilike '%' || q.s || '%'
           or (ot.attributes -> 'common_names')::text ilike '%' || q.s || '%'
           or ot.inhouse_code ilike q.s
           or ot.attributes ->> 'proposed_inhouse_code' ilike q.s)
      and (p_iucn is null or coalesce(ot.iucn_category, 'none') = p_iucn)
      and (p_origin is null or ot.origin = p_origin)
      and (p_zone is null or p_zone = any(ot.zones_present))
      and (p_code is null
           or (p_code = 'has' and ot.inhouse_code is not null)
           or (p_code = 'none' and ot.inhouse_code is null)
           or (p_code = 'proposed' and ot.inhouse_code is null and ot.attributes ? 'proposed_inhouse_code'))
  ),
  page as (
    select * from hits
    order by
      case when not p_desc then case p_sort when 'scientific_name' then scientific_name when 'family' then family
        when 'code' then inhouse_code when 'iucn' then iucn_category end end asc nulls last,
      case when p_desc then case p_sort when 'scientific_name' then scientific_name when 'family' then family
        when 'code' then inhouse_code when 'iucn' then iucn_category end end desc nulls last,
      case when not p_desc and p_sort = 'plants' then plants end asc nulls last,
      case when p_desc and p_sort = 'plants' then plants end desc nulls last,
      scientific_name
    limit greatest(least(p_limit, 500), 1) offset greatest(p_offset, 0)
  )
  select jsonb_build_object('total', (select count(*) from hits),
                            'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb))
$$;

-- One taxon with the organisation's fields and plant counts per zone.
create function taxon_detail(p_org uuid, p_taxon uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', tx.id, 'scientific_name', tx.scientific_name, 'authorship', tx.authorship, 'family', tx.family,
    'genus', tx.genus, 'rank', tx.rank, 'gbif_key', tx.gbif_key, 'common_names', tx.common_names,
    'accepted', (select jsonb_build_object('id', a.id, 'scientific_name', a.scientific_name)
                 from taxon a where a.id = tx.accepted_taxon_id),
    'org', jsonb_build_object(
      'inhouse_code', ot.inhouse_code, 'iucn_category', ot.iucn_category,
      'protection_level', ot.protection_level, 'origin', ot.origin, 'sensitive', ot.sensitive,
      'zones_present', to_jsonb(ot.zones_present), 'notes', ot.notes, 'attributes', ot.attributes,
      'updated_at', ot.updated_at),
    'plants_by_zone', coalesce((
      select jsonb_object_agg(z, n) from (
        select left(l.code, 2) as z, count(*) as n from asset a join location l on l.id = a.location_id
        where a.organisation_id = p_org and a.taxon_id = tx.id group by 1) s), '{}'::jsonb),
    'plants_by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select a.status, count(*) as n from asset a
        where a.organisation_id = p_org and a.taxon_id = tx.id group by 1) s), '{}'::jsonb))
  from taxon tx
  join org_taxon ot on ot.taxon_id = tx.id and ot.organisation_id = p_org
  where tx.id = p_taxon
$$;

-- Field-level change history of an org_taxon row, newest first (FR-TAX-05). Visible to curators,
-- managers and owners through the audit_log policies; others get an empty list.
create function taxon_history(p_org uuid, p_taxon uuid)
returns jsonb language sql stable set search_path = public as $$
  with h as (
    select al.at, al.action, al.actor, al.old, al.new
    from audit_log al
    where al.table_name = 'org_taxon' and al.organisation_id = p_org and al.row_id = p_taxon
  ),
  changes as (
    select h.at, h.action, h.actor,
           coalesce((select jsonb_agg(f order by f ->> 'field') from (
                       -- top-level fields
                       select jsonb_build_object('field', k, 'from', h.old -> k, 'to', h.new -> k) as f
                       from jsonb_object_keys(coalesce(h.new, '{}'::jsonb)) k
                       where h.action = 'update'
                         and k not in ('updated_at', 'created_at', 'created_by', 'attributes')
                         and h.old -> k is distinct from h.new -> k
                       union all
                       -- attributes, one entry per changed key (common names, proposed code, ...)
                       select jsonb_build_object('field', 'attributes.' || k,
                                                 'from', h.old -> 'attributes' -> k, 'to', h.new -> 'attributes' -> k)
                       from (select jsonb_object_keys(coalesce(h.old -> 'attributes', '{}'::jsonb)) as k
                             union select jsonb_object_keys(coalesce(h.new -> 'attributes', '{}'::jsonb))) ak
                       where h.action = 'update'
                         and h.old -> 'attributes' -> k is distinct from h.new -> 'attributes' -> k) x), '[]'::jsonb) as fields
    from h
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', c.at, 'action', c.action, 'by', m.display_name, 'fields', c.fields)
                  order by c.at desc), '[]'::jsonb)
  from changes c
  left join membership m on m.user_id = c.actor and m.organisation_id = p_org
  where c.action <> 'update' or jsonb_array_length(c.fields) > 0
$$;

revoke execute on function taxon_list(uuid, text, text, text, text, text, text, boolean, int, int) from public, anon;
revoke execute on function taxon_detail(uuid, uuid) from public, anon;
revoke execute on function taxon_history(uuid, uuid) from public, anon;
grant execute on function taxon_list(uuid, text, text, text, text, text, text, boolean, int, int) to authenticated;
grant execute on function taxon_detail(uuid, uuid) to authenticated;
grant execute on function taxon_history(uuid, uuid) to authenticated;

-- The asset form's species picker also searches the organisation's own common names.
create or replace function taxon_search(p_org uuid, p_q text, p_limit int default 20)
returns jsonb language sql stable set search_path = public as $$
  with q as (select nullif(trim(p_q), '') as s)
  select coalesce(jsonb_agg(r order by r.exact desc, r.scientific_name), '[]'::jsonb)
  from (
    select tx.id, tx.scientific_name, tx.authorship, tx.family,
           tx.common_names || coalesce(ot.attributes -> 'common_names', '{}'::jsonb) as common_names,
           tx.rank, ot.inhouse_code, ot.iucn_category,
           (ot.inhouse_code ilike q.s or tx.scientific_name ilike q.s || '%') as exact
    from taxon tx
    left join org_taxon ot on ot.taxon_id = tx.id and ot.organisation_id = p_org
    , q
    where q.s is not null
      and (tx.scientific_name ilike '%' || q.s || '%'
           or tx.common_names::text ilike '%' || q.s || '%'
           or (ot.attributes -> 'common_names')::text ilike '%' || q.s || '%'
           or ot.inhouse_code ilike q.s)
    order by (ot.inhouse_code ilike q.s or tx.scientific_name ilike q.s || '%') desc, tx.scientific_name
    limit greatest(least(p_limit, 50), 1)
  ) r
$$;
