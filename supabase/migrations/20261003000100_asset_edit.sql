-- Task 1.4: create and edit assets from the map (FR-AST-01..04).

-- Arabic name for catalogue entries (decision 3 Oct 2026). Arabic attribute labels live in the
-- attribute_schema as an "x-title-ar" keyword next to "title".
alter table asset_type add column name_ar text;

-- Tag patterns (DATA_MODEL section 4, FR-AST-05):
--   living tree    <ZONE><BED>-T<NN>_<CODE>   WG07-T04_PRO
--   planting group <ZONE><BED>-G<NN>_<CODE>   WG07-G01_PRO
--   built          <ZONE><BED>-<TYPE><NN>     SG03-VLV02
-- NN is two digits, three once a bed passes 99.
create function tag_pattern_ok(p_tag text, p_class asset_class)
returns boolean language sql immutable as $$
  select case p_class
    when 'living' then p_tag ~ '^[A-Z]{2}[0-9]{2}-[TG][0-9]{2,3}_[A-Z]{3}$'
    when 'built' then p_tag ~ '^[A-Z]{2}[0-9]{2}-[A-Z]{3}[0-9]{2,3}$'
  end
$$;

-- Short tag prefix for a built asset type: attribute_schema "x-tag-prefix", else the first three
-- letters of the type code.
create function asset_type_tag_prefix(p_type asset_type)
returns text language sql immutable as $$
  select upper(coalesce(p_type.attribute_schema ->> 'x-tag-prefix', left(regexp_replace(p_type.code, '[^A-Za-z]', '', 'g'), 3)))
$$;

-- Species part of a living tag: the organisation's in-house code, else the first three letters
-- of the genus (docs/HORTIS_MIGRATION.md).
create function taxon_tag_code(p_org uuid, p_taxon uuid)
returns text language sql stable set search_path = public as $$
  select upper(coalesce(ot.inhouse_code, left(coalesce(tx.genus, split_part(tx.scientific_name, ' ', 1)), 3)))
  from taxon tx
  left join org_taxon ot on ot.taxon_id = tx.id and ot.organisation_id = p_org
  where tx.id = p_taxon
$$;

-- Next free tag for a new asset placed at p_geom. The bed comes from the point (or a point on
-- the polygon); NN is one more than the highest number already used in that bed for the same
-- kind (T, G or the built prefix), across all species. Returns null with no bed under the point.
create function suggest_tag(p_site uuid, p_geom geometry, p_type uuid, p_taxon uuid default null,
                            p_group boolean default false)
returns text language plpgsql stable set search_path = public, extensions as $$
declare
  t asset_type;
  bed text;
  kind text;
  species text := '';
  n int;
begin
  select * into t from asset_type where id = p_type;
  if t.id is null then
    return null;
  end if;
  select replace(l.code, '-', '') into bed
  from location l where l.id = resolve_location(p_geom, p_site) and l.kind <> 'zone';
  if bed is null or bed !~ '^[A-Z]{2}[0-9]{2}$' then
    return null;
  end if;

  if t.asset_class = 'living' then
    kind := case when p_group then 'G' else 'T' end;
    species := coalesce('_' || taxon_tag_code(t.organisation_id, p_taxon), '_XXX');
  else
    kind := asset_type_tag_prefix(t);
  end if;

  select coalesce(max(substring(a.tag_code from '^' || bed || '-' || kind || '([0-9]{2,3})')::int), 0) + 1
    into n
  from asset a
  where a.organisation_id = t.organisation_id and a.tag_code like bed || '-' || kind || '%';

  return bed || '-' || kind || lpad(n::text, greatest(2, length(n::text)), '0') || species;
end
$$;

-- Validate a tag before saving: pattern for the class, and free in the organisation (ignoring
-- p_asset itself when editing). RLS limits the uniqueness check to what the caller can see,
-- which is the whole organisation for every member.
create function check_tag(p_org uuid, p_tag text, p_class asset_class, p_asset uuid default null)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pattern_ok', coalesce(tag_pattern_ok(p_tag, p_class), false),
    'taken_by', (select a.id from asset a
                 where a.organisation_id = p_org and a.tag_code = p_tag
                   and a.id is distinct from p_asset limit 1))
$$;

-- Species picker: scientific name, common names (any language) or in-house code.
create function taxon_search(p_org uuid, p_q text, p_limit int default 20)
returns jsonb language sql stable set search_path = public as $$
  with q as (select nullif(trim(p_q), '') as s)
  select coalesce(jsonb_agg(r order by r.exact desc, r.scientific_name), '[]'::jsonb)
  from (
    select tx.id, tx.scientific_name, tx.authorship, tx.family, tx.common_names, tx.rank,
           ot.inhouse_code, ot.iucn_category,
           (ot.inhouse_code ilike q.s or tx.scientific_name ilike q.s || '%') as exact
    from taxon tx
    left join org_taxon ot on ot.taxon_id = tx.id and ot.organisation_id = p_org
    , q
    where q.s is not null
      and (tx.scientific_name ilike '%' || q.s || '%'
           or tx.common_names::text ilike '%' || q.s || '%'
           or ot.inhouse_code ilike q.s)
    order by (ot.inhouse_code ilike q.s or tx.scientific_name ilike q.s || '%') desc, tx.scientific_name
    limit greatest(least(p_limit, 50), 1)
  ) r
$$;

revoke execute on function suggest_tag(uuid, geometry, uuid, uuid, boolean) from public, anon;
revoke execute on function check_tag(uuid, text, asset_class, uuid) from public, anon;
revoke execute on function taxon_search(uuid, text, int) from public, anon;
revoke execute on function taxon_tag_code(uuid, uuid) from public, anon;
grant execute on function suggest_tag(uuid, geometry, uuid, uuid, boolean) to authenticated;
grant execute on function check_tag(uuid, text, asset_class, uuid) to authenticated;
grant execute on function taxon_search(uuid, text, int) to authenticated;
grant execute on function taxon_tag_code(uuid, uuid) to authenticated;
