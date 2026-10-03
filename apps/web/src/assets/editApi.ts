import { supabase } from '../lib/supabase';
import type { Json } from '../types/db';

function check<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type AssetTypeOption = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  asset_class: 'living' | 'built';
  attribute_schema: Record<string, unknown>;
};

export type TaxonOption = {
  id: string;
  scientific_name: string;
  authorship: string | null;
  family: string | null;
  common_names: { en?: string[]; ar?: string[] };
  inhouse_code: string | null;
  iucn_category: string | null;
};

export async function fetchAssetTypeOptions(orgId: string): Promise<AssetTypeOption[]> {
  return check(
    await supabase
      .from('asset_type')
      .select('id, code, name, name_ar, asset_class, attribute_schema')
      .eq('organisation_id', orgId)
      .order('asset_class', { ascending: false })
      .order('name'),
  );
}

export async function searchTaxa(orgId: string, q: string): Promise<TaxonOption[]> {
  if (!q.trim()) return [];
  return check(await supabase.rpc('taxon_search', { p_org: orgId, p_q: q, p_limit: 15 }));
}

export async function fetchAccessions(orgId: string, taxonId: string) {
  return check<{ id: string; accession_number: string; received_date: string | null }[]>(
    await supabase
      .from('accession')
      .select('id, accession_number, received_date')
      .eq('organisation_id', orgId)
      .eq('taxon_id', taxonId)
      .order('accession_number'),
  );
}

export async function findAssetByTag(orgId: string, tag: string) {
  const rows = check<{ id: string; tag_code: string }[]>(
    await supabase
      .from('asset')
      .select('id, tag_code')
      .eq('organisation_id', orgId)
      .ilike('tag_code', `${tag}%`)
      .limit(8),
  );
  return rows;
}

export async function suggestTag(args: {
  siteId: string;
  ewkt: string;
  typeId: string;
  taxonId?: string;
  group?: boolean;
}) {
  return check<string | null>(
    await supabase.rpc('suggest_tag', {
      p_site: args.siteId,
      p_geom: args.ewkt as never,
      p_type: args.typeId,
      p_taxon: args.taxonId,
      p_group: args.group ?? false,
    }),
  );
}

export async function checkTag(
  orgId: string,
  tag: string,
  assetClass: 'living' | 'built',
  assetId?: string,
) {
  return check<{ pattern_ok: boolean; taken_by: string | null }>(
    await supabase.rpc('check_tag', {
      p_org: orgId,
      p_tag: tag,
      p_class: assetClass,
      p_asset: assetId,
    }),
  );
}

export type AssetWrite = {
  asset_type_id: string;
  tag_code: string;
  name: string | null;
  barcode: string | null;
  condition: number | null;
  criticality: number | null;
  install_date: string | null;
  taxon_id: string | null;
  accession_id: string | null;
  parent_asset_id: string | null;
  plant_count: number | null;
  position_source: string | null;
  position_accuracy_m: number | null;
  attributes: Record<string, unknown>;
};

export async function createAsset(
  orgId: string,
  siteId: string,
  ewkt: string,
  status: string,
  v: AssetWrite,
) {
  const row = check<{ id: string }>(
    await supabase
      .from('asset')
      .insert({
        ...v,
        attributes: v.attributes as NonNullable<Json>,
        organisation_id: orgId,
        site_id: siteId,
        geom: ewkt as never,
        status: status as never,
      })
      .select('id')
      .single(),
  );
  return row.id;
}

export async function updateAsset(id: string, v: Partial<AssetWrite>) {
  const row = { ...v, attributes: v.attributes as NonNullable<Json> | undefined };
  check(await supabase.from('asset').update(row).eq('id', id).select('id').single());
}

export async function setAssetStatus(id: string, status: string, reason: string | null) {
  check(
    await supabase.rpc('asset_set_status', {
      p_asset: id,
      p_status: status as never,
      p_reason: reason ?? undefined,
    }),
  );
}

export async function moveAsset(
  id: string,
  ewkt: string,
  source: string | null,
  accuracy: number | null,
) {
  // location_id is left alone so the trigger re-resolves the bed from the new position.
  check(
    await supabase
      .from('asset')
      .update({ geom: ewkt as never, position_source: source, position_accuracy_m: accuracy })
      .eq('id', id)
      .select('id')
      .single(),
  );
}
