// Asset status lifecycles per class (DATA_MODEL section 4, decision 28 Sep 2026).
export const LIVING_STATUSES = [
  'planned',
  'planted',
  'established',
  'declining',
  'dead',
  'removed',
] as const;
export const BUILT_STATUSES = [
  'planned',
  'active',
  'out_of_service',
  'removed',
  'disposed',
] as const;

export function statusesFor(assetClass: 'living' | 'built'): readonly string[] {
  return assetClass === 'living' ? LIVING_STATUSES : BUILT_STATUSES;
}

/** Sensible starting status for a new asset of the class. */
export function defaultStatus(assetClass: 'living' | 'built'): string {
  return assetClass === 'living' ? 'planted' : 'active';
}

export const POSITION_SOURCES = ['gps', 'rtk', 'offset', 'cad', 'hortis', 'bed_centroid'] as const;
