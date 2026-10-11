// Offset arithmetic on the site grid (metres). Coordinate transforms stay in the database; this is
// only plane geometry on grid x, y. Bearings are clockwise from grid north (+y), decision 11 Oct 2026.

export type Offset = { dx: number; dy: number };

/** Parse a number typed by a person: decimal comma allowed, spaces ignored. null when empty or invalid. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Bearing in degrees normalised to [0, 360). */
export function normaliseBearing(b: number): number {
  return ((b % 360) + 360) % 360;
}

/** Distance and grid bearing to dx, dy, rounded to the millimetre. */
export function fromDistanceBearing(distance: number, bearingDeg: number): Offset {
  const r = (normaliseBearing(bearingDeg) * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 1000) / 1000 || 0; // also turns -0 into 0
  return { dx: round(distance * Math.sin(r)), dy: round(distance * Math.cos(r)) };
}

/** dx, dy back to distance and grid bearing (for showing what an offset means). */
export function toDistanceBearing({ dx, dy }: Offset): { distance: number; bearing: number } {
  return {
    distance: Math.round(Math.hypot(dx, dy) * 1000) / 1000,
    bearing: Math.round(normaliseBearing((Math.atan2(dx, dy) * 180) / Math.PI) * 10) / 10,
  };
}
