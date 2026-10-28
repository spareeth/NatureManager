-- Task 1.5: QR route /a/:tag and label sheets (FR-AST-05, FR-AST-06). Security invoker.

-- Resolve a scanned code to an asset the caller can see: the Terra tag (case-insensitive) or an
-- existing Code 128 barcode. p_org first, so a user in several organisations lands in the one
-- they are working in.
create function asset_by_code(p_code text, p_org uuid default null)
returns table (id uuid, organisation_id uuid, tag_code text, matched text)
language sql stable set search_path = public as $$
  select a.id, a.organisation_id, a.tag_code,
         case when upper(a.tag_code) = upper(trim(p_code)) then 'tag' else 'barcode' end
  from asset a
  where upper(a.tag_code) = upper(trim(p_code)) or a.barcode = trim(p_code)
  order by (a.organisation_id = p_org) desc nulls last,
           (upper(a.tag_code) = upper(trim(p_code))) desc
  limit 1
$$;

-- Text printed on labels for the given assets, in tag order.
create function asset_labels(p_assets uuid[])
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'tag_code', a.tag_code,
           'scientific_name', tx.scientific_name,
           'common_name', tx.common_names -> 'en' ->> 0,
           'common_name_ar', tx.common_names -> 'ar' ->> 0,
           'inhouse_code', ot.inhouse_code,
           'type_name', t.name,
           'location_code', l.code)
         order by a.tag_code), '[]'::jsonb)
  from asset a
  join asset_type t on t.id = a.asset_type_id
  left join taxon tx on tx.id = a.taxon_id
  left join org_taxon ot on ot.organisation_id = a.organisation_id and ot.taxon_id = a.taxon_id
  left join location l on l.id = a.location_id
  where a.id = any(p_assets)
$$;

revoke execute on function asset_by_code(text, uuid) from public, anon;
revoke execute on function asset_labels(uuid[]) from public, anon;
grant execute on function asset_by_code(text, uuid) to authenticated;
grant execute on function asset_labels(uuid[]) to authenticated;
