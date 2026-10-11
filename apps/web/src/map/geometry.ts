// Geometry helpers for creating and moving assets. Coordinates are WGS 84 [lng, lat].
export type LngLat = [number, number];

const fmt = (n: number) => Number(n.toFixed(8)).toString();

/** EWKT that PostgREST passes straight to a PostGIS geometry column. */
export function pointEWKT([lng, lat]: LngLat): string {
  return `SRID=4326;POINT(${fmt(lng)} ${fmt(lat)})`;
}

/** Closed polygon ring as EWKT; needs at least three distinct corners. */
export function polygonEWKT(corners: LngLat[]): string {
  if (distinctCorners(corners) < 3) throw new Error('A polygon needs at least three corners');
  const ring = [...corners, corners[0]!];
  return `SRID=4326;POLYGON((${ring.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(', ')}))`;
}

export function distinctCorners(corners: LngLat[]): number {
  return new Set(corners.map(([x, y]) => `${fmt(x)},${fmt(y)}`)).size;
}

/** Point used for tag suggestion and bed lookup: the point itself, or the corner average. */
export function anchorOf(corners: LngLat[]): LngLat {
  const n = corners.length;
  return [corners.reduce((s, c) => s + c[0], 0) / n, corners.reduce((s, c) => s + c[1], 0) / n];
}
