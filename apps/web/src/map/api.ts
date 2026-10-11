import type { FeatureCollection, MultiPolygon, Point } from 'geojson';
import { supabase } from '../lib/supabase';

export type SiteSummary = { id: string; code: string; name: string };

export type MapSite = {
  id: string;
  code: string;
  name: string;
  basemap_url: string | null;
  grid_name: string | null;
  has_grid: boolean;
  boundary: MultiPolygon;
  bbox: [number, number, number, number]; // west, south, east, north
};

export type LocationProps = {
  id: string;
  code: string;
  name: string;
  kind: 'zone' | 'bed' | 'habitat' | 'water_body' | 'building' | 'sub_area' | 'other';
  parent_id: string | null;
  zone_code: string;
  area_m2: number;
};

export type AssetProps = {
  tag_code: string;
  status: string;
  asset_class: 'living' | 'built';
};

export type AssetDetail = AssetProps & {
  id: string;
  name: string | null;
  type_code: string;
  type_name: string;
  scientific_name: string | null;
  location_code: string | null;
  local_x: number | null;
  local_y: number | null;
  position_source: string | null;
  condition: number | null;
};

/** Compact rows from map_assets: [lon, lat, tag_code, status, asset_class]. */
export type AssetRows = {
  columns: string[];
  truncated: boolean;
  rows: [number, number, string, string, 'living' | 'built'][];
};

export function rowsToFeatures(data: AssetRows): FeatureCollection<Point, AssetProps> {
  return {
    type: 'FeatureCollection',
    features: data.rows.map(([lon, lat, tag_code, status, asset_class]) => ({
      type: 'Feature',
      id: tag_code,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { tag_code, status, asset_class },
    })),
  };
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Sites of the current organisation. RLS limits rows; the filter picks the chosen organisation. */
export async function fetchSites(organisationId: string): Promise<SiteSummary[]> {
  return check(
    await supabase
      .from('site')
      .select('id, code, name')
      .eq('organisation_id', organisationId)
      .order('code'),
  );
}

export async function fetchMapSite(siteId: string): Promise<MapSite> {
  return check(await supabase.rpc('map_site', { p_site: siteId })) as unknown as MapSite;
}

export async function fetchLocations(
  siteId: string,
): Promise<FeatureCollection<MultiPolygon, LocationProps>> {
  return check(
    await supabase.rpc('map_locations', { p_site: siteId }),
  ) as unknown as FeatureCollection<MultiPolygon, LocationProps>;
}

export async function fetchAssets(
  siteId: string,
  bbox: { west: number; south: number; east: number; north: number },
): Promise<{ features: FeatureCollection<Point, AssetProps>; truncated: boolean }> {
  const data = check(
    await supabase.rpc('map_assets', {
      p_site: siteId,
      p_west: bbox.west,
      p_south: bbox.south,
      p_east: bbox.east,
      p_north: bbox.north,
    }),
  ) as unknown as AssetRows;
  return { features: rowsToFeatures(data), truncated: data.truncated };
}

export async function fetchAssetDetail(siteId: string, tag: string): Promise<AssetDetail | null> {
  return check(
    await supabase.rpc('map_asset_detail', { p_site: siteId, p_tag: tag }),
  ) as unknown as AssetDetail | null;
}

export async function fetchLocalXY(
  siteId: string,
  lng: number,
  lat: number,
): Promise<{ x: number; y: number } | null> {
  const rows = check(
    await supabase.rpc('site_local_xy', { p_site: siteId, p_lon: lng, p_lat: lat }),
  );
  const r = rows?.[0];
  return r ? { x: Number(r.x), y: Number(r.y) } : null;
}
