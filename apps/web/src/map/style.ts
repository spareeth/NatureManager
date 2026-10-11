// Zone colours for beds (Terra Garden zones; other sites fall back to grey).
export const ZONE_COLOURS: Record<string, string> = {
  EG: '#d97706', // East Garden, amber
  NG: '#2563eb', // North Garden, blue
  SG: '#dc2626', // South Garden, red
  WG: '#7c3aed', // West Garden, violet
};
export const FALLBACK_COLOUR = '#6b7280';

export function zoneColour(zoneCode: string | null | undefined): string {
  return (zoneCode && ZONE_COLOURS[zoneCode]) || FALLBACK_COLOUR;
}

// Asset point colours by status: living assets green shades, built assets slate,
// problems stand out.
const STATUS_COLOURS: Record<string, string> = {
  planned: '#94a3b8',
  planted: '#4ade80',
  established: '#15803d',
  active: '#334155',
  declining: '#f59e0b',
  dead: '#111827',
  removed: '#9ca3af',
  out_of_service: '#ef4444',
  disposed: '#9ca3af',
};

export function statusColour(status: string): string {
  return STATUS_COLOURS[status] ?? FALLBACK_COLOUR;
}

export type LegendItem = { code: string; colour: string };

/** Zones present in the data, in code order, for the legend. */
export function legendZones(zoneCodes: Iterable<string>): LegendItem[] {
  return [...new Set(zoneCodes)].sort().map((code) => ({ code, colour: zoneColour(code) }));
}
