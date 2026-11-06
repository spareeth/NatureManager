import L from 'leaflet';
import { supabase } from '../lib/supabase';
import { pmtilesLayer } from './pmtilesLayer';

// Base maps per site (site_basemap). Google and Esri need an API key in .env.local and are never
// stored for offline use; PMTiles archives (the CAD plan) are online only too; XYZ layers (OpenStreetMap, our own orthophoto) may be, when marked.

export type Basemap = {
  id: string;
  site_id: string;
  name: string;
  kind: 'xyz' | 'google' | 'esri' | 'pmtiles';
  url: string | null;
  attribution: string | null;
  min_zoom: number;
  max_zoom: number;
  max_native_zoom: number;
  offline_allowed: boolean;
  is_default: boolean;
  sort_order: number;
  active: boolean;
};

export type Keys = { google?: string; esri?: string };
export const KEYS: Keys = {
  google: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  esri: import.meta.env.VITE_ESRI_API_KEY as string | undefined,
};

/** Esri World Imagery through ArcGIS Location Platform basemap tiles (needs an API key). */
export const ESRI_IMAGERY =
  'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=';

const COLS =
  'id, site_id, name, kind, url, attribution, min_zoom, max_zoom, max_native_zoom, offline_allowed, is_default, sort_order, active';

export async function fetchBasemaps(siteId: string): Promise<Basemap[]> {
  const { data, error } = await supabase
    .from('site_basemap')
    .select(COLS)
    .eq('site_id', siteId)
    .order('sort_order')
    .order('name');
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []) as Basemap[];
}

/** Layers the app can show: active, and with their key when they need one. The default is the site's
 *  default if it can be shown, else the first one. Always at least OpenStreetMap. */
export function resolveBasemaps(
  rows: Basemap[],
  keys: Keys = KEYS,
): { layers: Basemap[]; defaultId: string } {
  const layers = rows
    .filter(
      (b) =>
        b.active &&
        (b.kind === 'xyz' ||
          (b.kind === 'pmtiles' && !!b.url) ||
          (b.kind === 'google' && !!keys.google) ||
          (b.kind === 'esri' && !!keys.esri)),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  if (!layers.length) layers.push(FALLBACK);
  return { layers, defaultId: (layers.find((b) => b.is_default) ?? layers[0]!).id };
}

/** The layer for the field app map: the default if it may be stored offline, else the first that may. */
export function offlineBasemap(rows: Basemap[], keys: Keys = KEYS): Basemap {
  const { layers, defaultId } = resolveBasemaps(rows, keys);
  const usable = layers.filter((b) => b.kind === 'xyz' && b.offline_allowed);
  return usable.find((b) => b.id === defaultId) ?? usable[0] ?? FALLBACK;
}

/** URL templates whose tiles the phone may keep for the site (for warming the tile cache). */
export const offlineTemplates = (rows: Basemap[]) =>
  rows.filter((b) => b.active && b.kind === 'xyz' && b.offline_allowed && b.url).map((b) => b.url!);

export const FALLBACK: Basemap = {
  id: 'osm',
  site_id: '',
  name: 'OpenStreetMap',
  kind: 'xyz',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
  min_zoom: 0,
  max_zoom: 22,
  max_native_zoom: 19,
  offline_allowed: true,
  is_default: true,
  sort_order: 0,
  active: true,
};

/** Leaflet layer for an XYZ, PMTiles or Esri base map (Google needs a session first, see
 *  googleTiles.ts). */
export function tileLayerFor(b: Basemap, keys: Keys = KEYS): L.GridLayer {
  if (b.kind === 'pmtiles')
    return pmtilesLayer(b.url!, {
      minZoom: b.min_zoom,
      maxZoom: b.max_zoom,
      maxNativeZoom: b.max_native_zoom,
      attribution: b.attribution ?? undefined,
    });
  const url = b.kind === 'esri' ? ESRI_IMAGERY + encodeURIComponent(keys.esri ?? '') : b.url!;
  return L.tileLayer(url, {
    minZoom: b.min_zoom,
    maxZoom: b.max_zoom,
    maxNativeZoom: b.max_native_zoom,
    attribution: b.attribution ?? undefined,
  });
}

export type BasemapInput = Omit<Basemap, 'id' | 'site_id' | 'is_default'> & { id?: string };

export async function saveBasemap(orgId: string, siteId: string, v: BasemapInput) {
  const { id, ...row } = v;
  const res = id
    ? await supabase.from('site_basemap').update(row).eq('id', id)
    : await supabase
        .from('site_basemap')
        .insert({ ...row, organisation_id: orgId, site_id: siteId });
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
}

export async function setDefaultBasemap(id: string) {
  const { error } = await supabase.rpc('site_basemap_set_default', { p_basemap: id });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export async function deleteBasemap(id: string) {
  const { error } = await supabase.from('site_basemap').delete().eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}
