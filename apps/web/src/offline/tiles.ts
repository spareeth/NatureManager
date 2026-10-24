// Map tiles for the site, cached for offline use (FR-FLD-04). Only tile servers whose terms allow it:
// OpenStreetMap (a few dozen tiles for Terra Garden) and the site's own orthophoto. Google tiles are
// never stored (Google Maps Platform terms forbid caching).

export type BBox = [number, number, number, number]; // west, south, east, north (degrees)

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** Every z/x/y tile covering the box for zooms minZ..maxZ. */
export function tilesFor(bbox: BBox, minZ = 15, maxZ = 19) {
  const out: { z: number; x: number; y: number }[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    const [x0, x1] = [lon2x(bbox[0], z), lon2x(bbox[2], z)];
    const [y0, y1] = [lat2y(bbox[3], z), lat2y(bbox[1], z)];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const tileUrl = (template: string, t: { z: number; x: number; y: number }) =>
  template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y));

/** Fetch the tiles once so the service worker keeps them (cache name "tiles"). Returns how many loaded. */
export async function warmTiles(bbox: BBox, templates: string[]) {
  let ok = 0;
  for (const tpl of templates)
    for (const t of tilesFor(bbox)) {
      try {
        const res = await fetch(tileUrl(tpl, t), { mode: 'cors' });
        if (res.ok) ok++;
      } catch {
        // offline or blocked: the tile stays uncached
      }
    }
  return ok;
}
