import { supabase } from '../lib/supabase';
import { db } from '../offline/db';
import { enqueue } from '../offline/outbox';
import { kickSync } from '../offline/kick';
import { compressImage } from './image';
import { check } from './api';
import { audioExt } from '../work/media';
import { cachedRead } from '../offline/cache';

// New observation in the field app (FR-OBS-01, 02; FR-FLD-05): queued in the outbox with its photos and
// audio, so it works offline.

export const OBS_TYPES = [
  'flora',
  'fauna',
  'phenology',
  'pest_disease',
  'plant_health',
  'water_quality',
  'note',
] as const;
export type ObsType = (typeof OBS_TYPES)[number];
export const PHENOPHASES = ['leafing', 'flowering', 'fruiting', 'senescence'] as const;

export type ObservationInput = {
  orgId: string;
  siteId: string;
  obsType: ObsType;
  lat: number;
  lon: number;
  accuracy: number | null;
  locationId: string | null;
  assetId: string | null;
  count: number | null;
  lifeStage: string | null;
  phenophase: string | null;
  severity: number | null;
  notes: string | null;
};

/** Fields an observation of this type asks for. */
export function fieldsFor(t: ObsType) {
  return {
    count: t === 'fauna' || t === 'flora',
    lifeStage: t === 'fauna',
    phenophase: t === 'phenology',
    severity: t === 'pest_disease' || t === 'plant_health',
    audio: t === 'fauna' || t === 'note',
  };
}

/** Problems that stop saving (shown next to Save). */
export function observationProblems(
  v: Pick<ObservationInput, 'obsType' | 'phenophase'>,
  hasPoint: boolean,
): string[] {
  const out: string[] = [];
  if (!hasPoint) out.push('place');
  if (v.obsType === 'phenology' && !v.phenophase) out.push('phenophase');
  return out;
}

export async function queueObservation(v: ObservationInput, photos: Blob[], audio: Blob | null) {
  const id = crypto.randomUUID();
  // When the bed was chosen without GPS, the point is a placeholder inside it; the bed is kept as chosen.
  await enqueue('observation', null, {
    id,
    orgId: v.orgId,
    siteId: v.siteId,
    obsType: v.obsType,
    observedAt: new Date().toISOString(),
    geom: `SRID=4326;POINT(${v.lon} ${v.lat})`,
    accuracy: v.accuracy,
    count: v.count,
    lifeStage: v.lifeStage,
    phenophase: v.phenophase,
    severity: v.severity,
    notes: v.notes,
    assetId: v.assetId,
    locationId: v.locationId,
  });
  for (const f of photos) {
    const blob = await compressImage(f);
    const mediaId = crypto.randomUUID();
    await db.blobs.put({ id: mediaId, blob });
    await enqueue('photo', null, {
      org: v.orgId,
      mediaId,
      path: `${v.orgId}/obs/${id}/${mediaId}.jpg`,
      caption: null,
      takenAt: new Date().toISOString(),
      observationId: id,
    });
  }
  if (audio) {
    const mediaId = crypto.randomUUID();
    const type = audio.type || 'audio/webm';
    await db.blobs.put({ id: mediaId, blob: audio });
    await enqueue('photo', null, {
      org: v.orgId,
      mediaId,
      path: `${v.orgId}/obs/${id}/${mediaId}.${audioExt(type)}`,
      caption: 'sound recording',
      takenAt: new Date().toISOString(),
      observationId: id,
      bucket: 'audio',
      kind: 'audio',
      contentType: type,
    });
  }
  kickSync();
  return id;
}

export type MyObservation = {
  id: string;
  obs_type: ObsType;
  observed_at: string;
  verification: string;
  count: number | null;
  notes: string | null;
  location: { code: string } | null;
};

/** My recent observations (the last 20); the last copy is kept for offline use. */
export const fetchMyObservations = (siteId: string, userId: string) =>
  cachedRead(`my-observations:${siteId}`, async () =>
    check<MyObservation[]>(
      await supabase
        .from('observation')
        .select(
          'id, obs_type, observed_at, verification, count, notes, location:location!observation_location_id_organisation_id_fkey (code)',
        )
        .eq('site_id', siteId)
        .eq('observer', userId)
        .order('observed_at', { ascending: false })
        .limit(20),
    ),
  );

/** Beds and zones of the site, for choosing a place without GPS; kept for offline use. */
export const fetchPlaces = (siteId: string) =>
  cachedRead(`places:${siteId}`, async () =>
    check<{ id: string; code: string; lon: number; lat: number }[]>(
      await supabase.rpc('field_places', { p_site: siteId }),
    ),
  );
