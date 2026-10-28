import type { Geometry } from 'geojson';
import { supabase } from '../lib/supabase';
import type { AssetFilters } from './filters';
import { PAGE_SIZE } from './filters';
import type { AttributeSchema } from './attributes';
import type { TimelineEvent } from './timeline';

export type AssetRow = {
  id: string;
  tag_code: string;
  barcode: string | null;
  name: string | null;
  status: string;
  condition: number | null;
  criticality: number | null;
  install_date: string | null;
  local_x: number | null;
  local_y: number | null;
  type_code: string;
  type_name: string;
  asset_class: 'living' | 'built';
  scientific_name: string | null;
  inhouse_code: string | null;
  location_code: string | null;
  zone_code: string | null;
};

export type AssetDetail = {
  id: string;
  site_id: string;
  tag_code: string;
  barcode: string | null;
  name: string | null;
  status: string;
  condition: number | null;
  criticality: number | null;
  install_date: string | null;
  plant_count: number | null;
  attributes: Record<string, unknown>;
  legacy_hortis_id: string | null;
  geometry: Geometry;
  lon: number;
  lat: number;
  local_x: number | null;
  local_y: number | null;
  position_source: string | null;
  position_accuracy_m: number | null;
  created_at: string;
  updated_at: string;
  type: {
    id: string;
    code: string;
    name: string;
    asset_class: 'living' | 'built';
    attribute_schema: AttributeSchema;
  };
  taxon: {
    id: string;
    scientific_name: string;
    authorship: string | null;
    family: string | null;
    common_names: { en?: string[]; ar?: string[] };
    inhouse_code: string | null;
    iucn_category: string | null;
    origin: string | null;
    sensitive: boolean;
  } | null;
  accession: {
    id: string;
    accession_number: string;
    received_date: string | null;
    source: string | null;
    provenance_type: string | null;
  } | null;
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    zone_code: string;
    zone_name: string;
  } | null;
  parent: { id: string; tag_code: string } | null;
  children: { id: string; tag_code: string }[];
};

function check<T>(res: { data: unknown; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function searchAssets(
  siteId: string,
  f: AssetFilters,
): Promise<{ total: number; rows: AssetRow[] }> {
  return check(
    await supabase.rpc('asset_search', {
      p_site: siteId,
      p_q: f.q || undefined,
      p_class: f.assetClass || undefined,
      p_type: f.type || undefined,
      p_status: f.status.length ? (f.status as never) : undefined,
      p_location: f.location || undefined,
      p_sort: f.sort,
      p_desc: f.desc,
      p_limit: PAGE_SIZE,
      p_offset: (f.page - 1) * PAGE_SIZE,
    }),
  );
}

export async function fetchAssetDetail(id: string): Promise<AssetDetail | null> {
  return check(await supabase.rpc('asset_detail', { p_asset: id }));
}

export async function fetchTimeline(id: string): Promise<TimelineEvent[]> {
  return check(await supabase.rpc('asset_timeline', { p_asset: id }));
}

export async function fetchAssetTypes(organisationId: string) {
  return check<{ code: string; name: string; asset_class: 'living' | 'built' }[]>(
    await supabase
      .from('asset_type')
      .select('code, name, asset_class')
      .eq('organisation_id', organisationId)
      .order('name'),
  );
}

export async function fetchSiteLocations(siteId: string) {
  return check<{ code: string; kind: string }[]>(
    await supabase.from('location').select('code, kind').eq('site_id', siteId).order('code'),
  );
}

/** Signed URLs (1 hour) for private photos, keyed by "bucket/path". */
export async function signPhotos(
  items: { bucket: string; path: string }[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const byBucket = new Map<string, string[]>();
  for (const i of items) byBucket.set(i.bucket, [...(byBucket.get(i.bucket) ?? []), i.path]);
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
    if (error) continue;
    for (const d of data ?? []) if (d.signedUrl && d.path) out[`${bucket}/${d.path}`] = d.signedUrl;
  }
  return out;
}
