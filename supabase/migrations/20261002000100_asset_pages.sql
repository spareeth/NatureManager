-- Task 1.3: asset list and detail pages (FR-AST-03, FR-AST-07).
-- Functions are security invoker: RLS decides what the caller sees.

-- Members read the audit history of assets (the asset timeline shows condition changes and
-- moves, FR-AST-07). Asset rows are already readable by every member, so this adds no new data.
-- Other audited tables (org_taxon status fields and so on) stay manager and owner only.
create policy audit_log_read_asset on audit_log for select
  using (table_name = 'asset' and organisation_id in (select auth_org_ids()));

-- Asset list with search, filters, sort and paging. p_location matches the bed itself or any
-- location below it, so a zone code finds every asset in its beds.
create function asset_search(
  p_site uuid,
  p_q text default null,
  p_class asset_class default null,
  p_type text default null,
  p_status asset_status[] default null,
  p_location text default null,
  p_sort text default 'tag_code',
  p_desc boolean default false,
  p_limit int default 50,
  p_offset int default 0)
returns jsonb language sql stable set search_path = public, extensions as $$
  with recursive loc as (
    select id from location where site_id = p_site and code = p_location
    union all
    select l.id from location l join loc on l.parent_id = loc.id
  ),
  q as (select nullif(trim(p_q), '') as s),
  hits as (
    select a.id, a.tag_code, a.barcode, a.name, a.status, a.condition, a.criticality, a.install_date,
           a.local_x, a.local_y, a.updated_at,
           t.code as type_code, t.name as type_name, t.asset_class,
           tx.scientific_name, ot.inhouse_code,
           l.code as location_code, z.code as zone_code
    from asset a
    join asset_type t on t.id = a.asset_type_id
    left join taxon tx on tx.id = a.taxon_id
    left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
    left join location l on l.id = a.location_id
    left join location z on z.id = coalesce(l.parent_id, l.id)
    , q
    where a.site_id = p_site
      and (p_class is null or t.asset_class = p_class)
      and (p_type is null or t.code = p_type)
      and (p_status is null or a.status = any(p_status))
      and (p_location is null or a.location_id in (select id from loc))
      and (q.s is null
           or a.tag_code ilike '%' || q.s || '%'
           or a.barcode ilike '%' || q.s || '%'
           or a.name ilike '%' || q.s || '%'
           or tx.scientific_name ilike '%' || q.s || '%'
           or tx.common_names::text ilike '%' || q.s || '%'
           or ot.inhouse_code ilike q.s)
  ),
  page as (
    select * from hits
    order by
      case when not p_desc then case p_sort
        when 'tag_code' then tag_code when 'scientific_name' then scientific_name
        when 'type' then type_name when 'location' then location_code when 'status' then status::text end end asc nulls last,
      case when p_desc then case p_sort
        when 'tag_code' then tag_code when 'scientific_name' then scientific_name
        when 'type' then type_name when 'location' then location_code when 'status' then status::text end end desc nulls last,
      case when not p_desc and p_sort = 'condition' then condition end asc nulls last,
      case when p_desc and p_sort = 'condition' then condition end desc nulls last,
      case when not p_desc and p_sort = 'updated_at' then updated_at end asc nulls last,
      case when p_desc and p_sort = 'updated_at' then updated_at end desc nulls last,
      tag_code
    limit greatest(least(p_limit, 500), 1) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'updated_at') from page), '[]'::jsonb))
$$;

-- One asset with everything the detail page shows.
create function asset_detail(p_asset uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', a.id, 'site_id', a.site_id, 'tag_code', a.tag_code, 'barcode', a.barcode, 'name', a.name,
    'status', a.status, 'condition', a.condition, 'criticality', a.criticality,
    'install_date', a.install_date, 'plant_count', a.plant_count, 'attributes', a.attributes,
    'legacy_hortis_id', a.legacy_hortis_id,
    'geometry', st_asgeojson(a.geom, 7)::jsonb,
    'lon', round(st_x(case when geometrytype(a.geom) = 'POINT' then a.geom else st_pointonsurface(a.geom) end)::numeric, 7),
    'lat', round(st_y(case when geometrytype(a.geom) = 'POINT' then a.geom else st_pointonsurface(a.geom) end)::numeric, 7),
    'local_x', a.local_x, 'local_y', a.local_y,
    'position_source', a.position_source, 'position_accuracy_m', a.position_accuracy_m,
    'created_at', a.created_at, 'updated_at', a.updated_at,
    'type', jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'asset_class', t.asset_class,
                               'attribute_schema', t.attribute_schema),
    'taxon', case when tx.id is null then null else jsonb_build_object(
               'id', tx.id, 'scientific_name', tx.scientific_name, 'authorship', tx.authorship,
               'family', tx.family, 'common_names', tx.common_names,
               'inhouse_code', ot.inhouse_code, 'iucn_category', ot.iucn_category,
               'origin', ot.origin, 'sensitive', coalesce(ot.sensitive, false)) end,
    'accession', case when ac.id is null then null else jsonb_build_object(
               'id', ac.id, 'accession_number', ac.accession_number, 'received_date', ac.received_date,
               'source', ac.source, 'provenance_type', ac.provenance_type) end,
    'location', case when l.id is null then null else jsonb_build_object(
               'id', l.id, 'code', l.code, 'name', l.name, 'kind', l.kind,
               'zone_code', z.code, 'zone_name', z.name) end,
    'parent', case when p.id is null then null else jsonb_build_object('id', p.id, 'tag_code', p.tag_code) end,
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'tag_code', c.tag_code) order by c.tag_code)
                          from asset c where c.parent_asset_id = a.id), '[]'::jsonb))
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
  left join accession ac on ac.id = a.accession_id
  left join location l on l.id = a.location_id
  left join location z on z.id = coalesce(l.parent_id, l.id)
  left join asset p on p.id = a.parent_asset_id
  where a.id = p_asset
$$;

-- Asset history, newest first (FR-AST-07). Kinds:
--   created, status (with reason), condition, moved, edited (other fields), photo.
-- Work orders and observations join this list when those tables exist (Phase 2).
create function asset_timeline(p_asset uuid)
returns jsonb language sql stable set search_path = public, extensions as $$
  with a as (select id, organisation_id from asset where id = p_asset),
  people as (
    select m.user_id, m.display_name from membership m join a on a.organisation_id = m.organisation_id
  ),
  -- Fields that are derived or bookkeeping, never shown as edits.
  ignored as (select unnest(array['updated_at', 'created_at', 'created_by', 'local_x', 'local_y',
                                  'location_id', 'status']) as k),
  edits as (
    select al.at, al.actor, al.old, al.new,
           array(select k from jsonb_object_keys(al.new) k
                 where k not in (select k from ignored)
                   and al.old -> k is distinct from al.new -> k) as changed
    from audit_log al join a on al.row_id = a.id
    where al.table_name = 'asset' and al.action = 'update'
  ),
  events as (
    -- created
    select al.at, al.actor, 'created' as kind, jsonb_build_object('tag_code', al.new ->> 'tag_code') as data
    from audit_log al join a on al.row_id = a.id
    where al.table_name = 'asset' and al.action = 'insert'
    union all
    -- status changes (the initial status is part of "created")
    select sc.changed_at, sc.changed_by, 'status',
           jsonb_build_object('from', sc.from_status, 'to', sc.to_status, 'reason', sc.reason)
    from asset_status_change sc join a on sc.asset_id = a.id
    where sc.from_status is not null
    union all
    select at, actor, 'condition', jsonb_build_object('from', old -> 'condition', 'to', new -> 'condition')
    from edits where 'condition' = any(changed)
    union all
    select at, actor, 'moved', jsonb_build_object(
             'from', jsonb_build_object('x', old -> 'local_x', 'y', old -> 'local_y'),
             'to', jsonb_build_object('x', new -> 'local_x', 'y', new -> 'local_y'),
             'position_source', new -> 'position_source',
             'accuracy_m', new -> 'position_accuracy_m')
    from edits where 'geom' = any(changed)
    union all
    select at, actor, 'edited', jsonb_build_object('fields', to_jsonb(array(
             select f from unnest(changed) f
             where f not in ('condition', 'geom', 'position_source', 'position_accuracy_m')
                or ('geom' <> all(changed) and f in ('position_source', 'position_accuracy_m')))))
    from edits
    where exists (select 1 from unnest(changed) f
                  where f not in ('condition', 'geom', 'position_source', 'position_accuracy_m')
                     or ('geom' <> all(changed) and f in ('position_source', 'position_accuracy_m')))
    union all
    select coalesce(md.taken_at, md.created_at), md.created_by, 'photo',
           jsonb_build_object('media_id', md.id, 'bucket', md.bucket, 'path', md.path,
                              'kind', md.kind, 'caption', md.caption)
    from media md join a on md.asset_id = a.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'at', e.at, 'kind', e.kind, 'by', p.display_name, 'data', e.data)
           order by e.at desc, e.kind), '[]'::jsonb)
  from events e left join people p on p.user_id = e.actor
$$;

revoke execute on function asset_search(uuid, text, asset_class, text, asset_status[], text, text, boolean, int, int) from public, anon;
revoke execute on function asset_detail(uuid) from public, anon;
revoke execute on function asset_timeline(uuid) from public, anon;
grant execute on function asset_search(uuid, text, asset_class, text, asset_status[], text, text, boolean, int, int) to authenticated;
grant execute on function asset_detail(uuid) to authenticated;
grant execute on function asset_timeline(uuid) to authenticated;
