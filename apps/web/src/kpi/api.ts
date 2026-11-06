import { supabase } from '../lib/supabase';

// Biodiversity baseline and water requirement (KPI reporting). Methods: Terra Garden baseline kit,
// scripts 02 (diversity) and 06 (FAO-56). Computed in the database from the live plant records.

function check<T>(r: { data: unknown; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export type BioBed = {
  bed: string;
  zone: string;
  area_m2: number;
  s: number;
  n: number;
  shannon: number;
  simpson: number;
  inv_simpson: number;
  evenness: number;
  margalef: number;
  hill_q0: number;
  hill_q1: number;
  hill_q2: number;
  species_density_ha: number;
  pct_native_species: number | null;
  pct_native_plants: number | null;
  s_threatened: number;
  mean_bray: number | null;
  mean_sorensen: number | null;
  mean_turnover: number | null;
  mean_nestedness: number | null;
};
export type BioZone = {
  zone: string;
  n_beds: number;
  total_s: number;
  total_n: number;
  mean_s: number;
  sd_s: number | null;
  mean_h: number;
  mean_j: number;
  gamma_s: number;
};
export type Bio = {
  garden: {
    gamma_s: number;
    plants: number;
    beds: number;
    beds_with_plants: number;
    mean_s: number;
    sd_s: number;
    mean_shannon: number;
    mean_evenness: number;
    shannon: number;
    native_species: number;
    pct_native_species: number;
    pct_native_plants: number;
    threatened_species: number;
    mean_sorensen: number;
  };
  zones: BioZone[];
  beds: BioBed[];
};

export type WaterBed = {
  bed: string;
  zone: string;
  area_m2: number;
  kc: number;
  n_plants: number;
  dominant_life_form: string;
  pct_succulent: number;
  demand_l_day_by_month: number[];
  demand_m3_yr: number;
  current_m3_yr: number;
  saving_pct: number;
  months_under: number;
  peak_demand_l_day: number;
  peak_month: number;
  demand_l_m2_yr: number;
  meters: number;
  metered_m3_yr: number | null;
};
export type Param = {
  value: unknown;
  unit: string | null;
  source: string | null;
  verified: boolean;
};
export type Water = {
  parameters: Record<string, Param>;
  garden: {
    area_m2: number;
    beds: number;
    mean_kc: number;
    demand_m3_yr: number;
    current_m3_yr: number;
    saving_m3_yr: number;
    saving_pct: number;
    saving_aed_yr: number;
    beds_under: number;
    metered_beds: number;
  };
  months: { month: number; eto: number; demand_m3_day: number; current_m3_day: number }[];
  beds: WaterBed[];
};

export type Overlay = {
  id: string;
  code: string;
  name: string;
  kind: 'ndvi' | 'greenness' | 'stress' | 'imagery';
  module: string;
  acquired_on: string | null;
  url: string;
  min_zoom: number;
  max_zoom: number;
  legend: [number | string, string][];
  notes: string | null;
  beds: Record<string, { mean: number; p10: number | null; p90: number | null; stress: Stress }>;
};
export type Stress = 'none' | 'moderate' | 'high';

export const fetchBio = async (siteId: string) =>
  check<Bio>(await supabase.rpc('bio_baseline', { p_site: siteId }));
export const fetchWater = async (siteId: string) =>
  check<Water>(await supabase.rpc('water_requirement', { p_site: siteId }));
export const fetchOverlays = async (siteId: string, module: 'biodiversity' | 'water') =>
  check<Overlay[]>(await supabase.rpc('site_overlays', { p_site: siteId, p_module: module }));
export const fetchHistory = async (siteId: string, module: 'biodiversity' | 'water') =>
  check<{ taken_on: string; data: Record<string, unknown> }[]>(
    await supabase.rpc('kpi_history', { p_site: siteId, p_module: module }),
  );
export const takeSnapshot = async (siteId: string) =>
  check<number>(await supabase.rpc('kpi_take_snapshot', { p_site: siteId }));

export async function saveParam(orgId: string, module: string, key: string, value: unknown) {
  const { error } = await supabase
    .from('kpi_parameter')
    .update({ value: value as never })
    .eq('organisation_id', orgId)
    .eq('module', module)
    .eq('key', key);
  if (error) throw new Error(error.message);
}

/** Quantile class breaks (5 classes) for a choropleth; equal values collapse. */
export function quantileBreaks(values: number[], classes = 5): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const out: number[] = [];
  for (let i = 1; i < classes; i++)
    out.push(v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))]!);
  return [...new Set(out)];
}

export const classOf = (x: number, breaks: number[]) => breaks.filter((b) => x >= b).length;

/** Single-hue sequential ramps, light to dark (5 steps). */
export const RAMPS = {
  green: ['#e3f1dc', '#b5d9a3', '#7fbf6a', '#4a9a44', '#1f6a2b'],
  blue: ['#deebf7', '#b3d1ea', '#79acd6', '#3f84bd', '#165a93'],
};
export const STRESS_COLOR: Record<Stress, string> = {
  none: '#cfe3c6',
  moderate: '#e9a23b',
  high: '#c2410c',
};

export type RichnessSummary = {
  n: number;
  s_obs: number;
  singletons: number;
  doubletons: number;
  chao1: number;
  coverage: number;
  curve: { m: number; s: number; extrapolated: boolean }[];
};
export type MoranResult = {
  i: number | null;
  p: number | null;
  expected: number;
  beds: number;
  with_neighbours: number;
  permutations: number;
};
export type CarbonBed = {
  bed: string;
  zone: string;
  biomass_t: number;
  carbon_t: number;
  carbon_ci95_t: number;
  co2e_t: number;
  carbon_t_ha: number;
};
export type CarbonTotal = {
  biomass_t: number;
  carbon_t: number;
  carbon_ci95_t: number;
  co2e_t: number;
  carbon_t_ha: number;
};
export type BioAnalytics = {
  richness: Record<string, RichnessSummary>; // zones and "all"
  moran: { richness: MoranResult; shannon: MoranResult };
  carbon: { beds: CarbonBed[]; totals: Record<string, CarbonTotal> };
};

export const fetchAnalytics = async (siteId: string) =>
  check<BioAnalytics>(await supabase.rpc('bio_analytics', { p_site: siteId }));
export const fetchCommunity = async (siteId: string) =>
  check<Record<string, Record<string, number>>>(
    await supabase.rpc('bio_community', { p_site: siteId }),
  );

/** Gardens in a fixed order with fixed colours (validated categorical palette); the whole site in ink. */
export const ZONE_ORDER = ['EG', 'NG', 'SG', 'WG'] as const;
export const ZONE_COLOR: Record<string, string> = {
  EG: '#2a78d6',
  NG: '#eb6834',
  SG: '#1baf7a',
  WG: '#eda100',
  all: '#1f2937',
};
