import { supabase } from '../lib/supabase';
import { searchAssets } from '../assets/api';
import type { AssetFilters } from '../assets/filters';
import type { LabelData } from './pdf';

export const MAX_LABELS = 2000;

/** Asset ids matching the list filters, every page, up to MAX_LABELS. */
export async function idsForFilters(siteId: string, f: AssetFilters): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ids.length < MAX_LABELS; page++) {
    // searchAssets pages by 50; read the filter page by page.
    const res = await searchAssets(siteId, { ...f, page });
    ids.push(...res.rows.map((r) => r.id));
    if (ids.length >= res.total || res.rows.length === 0) break;
  }
  return ids.slice(0, MAX_LABELS);
}

export async function fetchLabels(ids: string[]): Promise<LabelData[]> {
  const { data, error } = await supabase.rpc('asset_labels', { p_assets: ids });
  if (error) throw new Error(error.message);
  return data as unknown as LabelData[];
}

export async function assetByCode(code: string, orgId?: string) {
  const { data, error } = await supabase.rpc('asset_by_code', { p_code: code, p_org: orgId });
  if (error) throw new Error(error.message);
  return (data?.[0] ?? null) as {
    id: string;
    organisation_id: string;
    tag_code: string;
    matched: 'tag' | 'barcode';
  } | null;
}
