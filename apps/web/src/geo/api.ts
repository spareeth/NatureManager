import { supabase } from '../lib/supabase';

export type System = 'wgs84' | 'dltm' | 'grid';
export type SitePoint = { lon: number; lat: number; e: number; n: number; x: number; y: number };
export type Corner = SitePoint & { code: string; vertex: number; distance_m: number };

export type ControlPoint = {
  id: string;
  code: string;
  description: string | null;
  source: string;
  accuracy_m: number | null;
  surveyed_at: string | null;
  lat: number;
  lon: number;
  e: number;
  n: number;
  x: number;
  y: number;
  ref_x: number | null;
  ref_y: number | null;
  ref_source: string | null;
  dx: number | null;
  dy: number | null;
  residual_m: number | null;
};
export type ControlPointList = {
  rows: ControlPoint[];
  with_reference: number;
  rmse_m: number | null;
  max_m: number | null;
};

function check<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

/** A position typed in one system, returned in all three (conversion in the database). */
export async function sitePoint(
  siteId: string,
  system: System,
  a: number,
  b: number,
): Promise<SitePoint | null> {
  return check(
    await supabase.rpc('site_point', { p_site: siteId, p_system: system, p_a: a, p_b: b }),
  );
}

export async function nearestCorner(
  siteId: string,
  lon: number,
  lat: number,
  maxM = 3,
): Promise<Corner | null> {
  return check(
    await supabase.rpc('nearest_bed_corner', {
      p_site: siteId,
      p_lon: lon,
      p_lat: lat,
      p_max_m: maxM,
    }),
  );
}

export async function listControlPoints(siteId: string): Promise<ControlPointList> {
  return check(await supabase.rpc('control_point_list', { p_site: siteId }));
}

export type ControlPointWrite = {
  code: string;
  description: string | null;
  source: string;
  accuracy_m: number | null;
  surveyed_at: string | null;
  ref_x: number | null;
  ref_y: number | null;
  ref_source: string | null;
  lon: number;
  lat: number;
};

export async function saveControlPoint(
  orgId: string,
  siteId: string,
  v: ControlPointWrite,
  id?: string,
) {
  const { lon, lat, ...rest } = v;
  const row = { ...rest, geom: `SRID=4326;POINT(${lon} ${lat})` as never };
  if (id) {
    const data = check<unknown[]>(
      await supabase.from('control_point').update(row).eq('id', id).select('id'),
    );
    if (!data.length) throw new Error('not_allowed');
  } else {
    check(
      await supabase
        .from('control_point')
        .insert({ ...row, organisation_id: orgId, site_id: siteId })
        .select('id')
        .single(),
    );
  }
}

export async function deleteControlPoint(id: string) {
  const data = check<unknown[]>(
    await supabase.from('control_point').delete().eq('id', id).select('id'),
  );
  if (!data.length) throw new Error('not_allowed');
}

export async function moveAssetByOffset(
  assetId: string,
  dx: number,
  dy: number,
  accuracy: number | null,
) {
  return check<{ id: string; local_x: number; local_y: number }>(
    await supabase.rpc('asset_move_offset', {
      p_asset: assetId,
      p_dx: dx,
      p_dy: dy,
      p_accuracy: accuracy ?? undefined,
    }),
  );
}
