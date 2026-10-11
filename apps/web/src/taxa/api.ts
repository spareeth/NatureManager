import { supabase } from '../lib/supabase';
import type { Json } from '../types/db';
import { TAXA_PAGE, type TaxonFilters } from './filters';

export type TaxonRow = {
  id: string;
  scientific_name: string;
  authorship: string | null;
  family: string | null;
  common_en: string | null;
  common_ar: string | null;
  inhouse_code: string | null;
  proposed_code: string | null;
  iucn_category: string | null;
  origin: string | null;
  protection_level: string | null;
  sensitive: boolean;
  zones_present: string[] | null;
  plants: number;
  dead: number;
};

export type OrgTaxonFields = {
  inhouse_code: string | null;
  iucn_category: string | null;
  protection_level: string | null;
  origin: string | null;
  sensitive: boolean;
  zones_present: string[] | null;
  notes: string | null;
  attributes: Record<string, unknown> & {
    common_names?: { en?: string[]; ar?: string[] };
    proposed_inhouse_code?: string;
  };
  updated_at: string;
};

export type TaxonDetail = {
  id: string;
  scientific_name: string;
  authorship: string | null;
  family: string | null;
  genus: string | null;
  rank: string;
  gbif_key: number | null;
  common_names: { en?: string[]; ar?: string[] };
  accepted: { id: string; scientific_name: string } | null;
  org: OrgTaxonFields;
  plants_by_zone: Record<string, number>;
  plants_by_status: Record<string, number>;
};

export type HistoryEntry = {
  at: string;
  action: 'insert' | 'update' | 'delete';
  by: string | null;
  fields: { field: string; from: unknown; to: unknown }[];
};

function check<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

export async function listTaxa(
  orgId: string,
  f: TaxonFilters,
): Promise<{ total: number; rows: TaxonRow[] }> {
  return check(
    await supabase.rpc('taxon_list', {
      p_org: orgId,
      p_q: f.q || undefined,
      p_iucn: f.iucn || undefined,
      p_origin: f.origin || undefined,
      p_zone: f.zone || undefined,
      p_code: f.code || undefined,
      p_sort: f.sort,
      p_desc: f.desc,
      p_limit: TAXA_PAGE,
      p_offset: (f.page - 1) * TAXA_PAGE,
    }),
  );
}

export async function fetchTaxon(orgId: string, taxonId: string): Promise<TaxonDetail | null> {
  return check(await supabase.rpc('taxon_detail', { p_org: orgId, p_taxon: taxonId }));
}

export async function fetchTaxonHistory(orgId: string, taxonId: string): Promise<HistoryEntry[]> {
  return check(await supabase.rpc('taxon_history', { p_org: orgId, p_taxon: taxonId }));
}

export type OrgTaxonPatch = Partial<Omit<OrgTaxonFields, 'updated_at' | 'attributes'>> & {
  attributes?: Record<string, unknown>;
};

/** Curator edit. RLS allows only curators; returns the row so a silent RLS refusal is caught. */
export async function updateOrgTaxon(orgId: string, taxonId: string, patch: OrgTaxonPatch) {
  const row = { ...patch, attributes: patch.attributes as NonNullable<Json> | undefined };
  const data = check<unknown[]>(
    await supabase
      .from('org_taxon')
      .update(row)
      .eq('organisation_id', orgId)
      .eq('taxon_id', taxonId)
      .select('taxon_id'),
  );
  if (!data.length) throw new Error('not_allowed');
}
