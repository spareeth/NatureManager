// Filter and group issues and requests by garden (zone) and bed. Location codes: zones EG, NG, SG,
// WG; beds EG-01 .. WG-10 (the zone is the part before the dash).

export const ZONES = ['EG', 'NG', 'SG', 'WG'] as const;
export type PlaceFilter = { zone: string; bed: string }; // '' means all; 'none' means without a place

export const ALL_PLACES: PlaceFilter = { zone: '', bed: '' };

export const zoneOf = (code: string | null | undefined) => (code ? code.split('-')[0]! : null);

export function placeMatches(code: string | null | undefined, f: PlaceFilter): boolean {
  if (f.zone === 'none') return !code;
  if (f.zone && zoneOf(code) !== f.zone) return false;
  if (f.bed && code !== f.bed) return false;
  return true;
}

/** Beds (and zone-level places) present in the items, for the bed picker, in code order. */
export function bedsIn(codes: (string | null | undefined)[], zone: string): string[] {
  return [
    ...new Set(codes.filter((c): c is string => !!c && (!zone || zoneOf(c) === zone))),
  ].sort();
}

/** Items grouped by place code, in code order, items without a place last. */
export function groupByPlace<T>(
  items: T[],
  code: (t: T) => string | null | undefined,
): [string | null, T[]][] {
  const m = new Map<string | null, T[]>();
  for (const it of items) {
    const k = code(it) ?? null;
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return [...m.entries()].sort(([a], [b]) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  );
}
