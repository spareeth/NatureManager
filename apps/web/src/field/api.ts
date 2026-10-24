import { supabase } from '../lib/supabase';
import type { Json } from '../types/db';
import type { WoDetail } from '../work/api';
import type { WoStatus } from '../work/model';
import { db, dayKey, type CachedAsset } from '../offline/db';
import { isTransient } from '../offline/errors';
import { enqueue } from '../offline/outbox';
import { kickSync } from '../offline/kick';
import { compressImage } from './image';

// Field app data. Reads go to the server and fall back to the offline store when there is no
// network; writes go to the outbox first (CLAUDE.md rule 5) and are sent by the sync worker.

type Res = { data: unknown; error: { message: string; code?: string } | null; status?: number };
export function check<T>(res: Res): T {
  if (res.error)
    throw Object.assign(new Error(res.error.message), { code: res.error.code, status: res.status });
  return res.data as T;
}

export class NotOffline extends Error {}

/** Server first; on a network problem use the offline copy (or say it is not available offline). */
async function readThrough<T>(
  server: () => Promise<T>,
  save: (v: T) => Promise<unknown>,
  cached: () => Promise<T | undefined>,
) {
  try {
    // Known to be offline: do not wait for requests to fail.
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      throw new TypeError('offline');
    const v = await server();
    await save(v).catch(() => undefined);
    return { data: v, offline: false };
  } catch (e) {
    if (!isTransient(e)) throw e;
    const c = await cached();
    if (c === undefined) throw new NotOffline((e as Error).message);
    return { data: c, offline: true };
  }
}

export type Bilingual = { en: string; ar?: string };
export type DayJob = {
  id: string;
  number: string;
  title: string;
  status: WoStatus;
  priority: string;
  wo_type: string;
  planned_start: string | null;
  due_at: string | null;
  location_code: string | null;
  est_minutes: number | null;
  mine: boolean;
  lon: number | null;
  lat: number | null;
  steps: number;
  answered: number;
  overdue: boolean;
};
export type StepInput = 'tick' | 'number' | 'text' | 'photo' | 'choice';
export type JobStep = {
  id: string;
  seq: number;
  text: Bilingual;
  input_type: StepInput;
  choices: string[] | null;
  unit: string | null;
  required: boolean;
  media_path: string | null;
  value: Json | null;
  media_id: string | null;
  media_path_answer: string | null;
  /** Photo taken on the phone and not yet sent (offline store blob id). */
  blobId?: string;
};
export type Material = { item: string; qty?: number; unit?: string };
export type FieldJob = Omit<WoDetail, 'sop' | 'materials'> & {
  mine: boolean;
  organisation_id: string;
  materials: Material[];
  sop: {
    id: string;
    code: string;
    version: number;
    title: Bilingual;
    ppe: string[] | null;
    hazards: string[] | null;
  } | null;
  steps: JobStep[];
  missing: number[];
  photos: {
    id: string;
    path: string | null;
    caption: string | null;
    taken_at: string | null;
    blobId?: string;
  }[];
};

export type ScanJob = {
  id: string;
  number: string;
  title: string;
  status: WoStatus;
  priority: string;
  planned_start: string | null;
  mine: boolean;
};
export type ScannedAsset = {
  id: string;
  organisation_id: string;
  site_id: string;
  tag_code: string;
  name: string | null;
  status: string;
  location_id: string | null;
  location_code: string | null;
  scientific_name: string | null;
  lon: number | null;
  lat: number | null;
  jobs: ScanJob[];
};

export const fetchMyDay = async (siteId: string, day: string) =>
  readThrough(
    async () => check<DayJob[]>(await supabase.rpc('field_my_day', { p_site: siteId, p_day: day })),
    (list) => db.days.put({ key: dayKey(siteId, day), list, savedAt: new Date().toISOString() }),
    async () => (await db.days.get(dayKey(siteId, day)))?.list,
  );

export const fetchJob = async (id: string) =>
  readThrough(
    async () => check<FieldJob | null>(await supabase.rpc('field_job', { p_wo: id })),
    (job) =>
      job ? db.jobs.put({ id, data: job, savedAt: new Date().toISOString() }) : db.jobs.delete(id),
    async () => (await db.jobs.get(id))?.data,
  );

/** Asset by scanned tag or barcode, with its open jobs. Offline: the assets kept for my zones. */
export const scanCode = async (code: string, orgId?: string) =>
  readThrough<ScannedAsset | null>(
    async () => {
      const hit = check<{ id: string }[]>(
        await supabase.rpc('asset_by_code', { p_code: code, p_org: orgId }),
      )?.[0];
      return hit
        ? check<ScannedAsset | null>(await supabase.rpc('field_scan', { p_asset: hit.id }))
        : null;
    },
    async () => undefined,
    async () => {
      const a: CachedAsset | undefined =
        (await db.assets.where('tag_code').equals(code).first()) ??
        (await db.assets.where('barcode').equals(code).first());
      if (!a) return null;
      const jobs = (await db.jobs.toArray())
        .map((r) => r.data)
        .filter(
          (j) =>
            j.assets.some((x) => x.id === a.id) &&
            ['requested', 'approved', 'scheduled', 'in_progress', 'on_hold'].includes(j.status),
        )
        .map((j) => ({
          id: j.id,
          number: j.number,
          title: j.title,
          status: j.status,
          priority: j.priority,
          planned_start: j.planned_start,
          mine: j.mine,
        }));
      return { ...a, jobs };
    },
  );

// Writes: queued, then synced -------------------------------------------------------------

type JobRef = Pick<FieldJob, 'id' | 'organisation_id'>;

export async function moveJob(job: JobRef, to: WoStatus, note?: string) {
  await enqueue('transition', job.id, { to, note: note || null });
  kickSync();
}

export async function answerStep(
  job: JobRef,
  stepId: string,
  answer: { value?: Json | null; mediaId?: string | null },
) {
  await enqueue('answer', job.id, {
    org: job.organisation_id,
    stepId,
    ...('value' in answer ? { value: answer.value ?? null } : {}),
    ...(answer.mediaId ? { mediaId: answer.mediaId } : {}),
  });
  kickSync();
}

/** Compress (max 1600 px), keep the photo on the phone and queue its upload. Returns the media id. */
export async function addJobPhoto(job: JobRef, file: Blob, caption?: string) {
  const blob = await compressImage(file);
  const mediaId = crypto.randomUUID();
  await db.blobs.put({ id: mediaId, blob });
  await enqueue('photo', job.id, {
    org: job.organisation_id,
    mediaId,
    path: `${job.organisation_id}/wo/${job.id}/${mediaId}.jpg`,
    caption: caption || null,
    takenAt: new Date().toISOString(),
  });
  kickSync();
  return mediaId;
}

export async function saveJobRecord(
  job: JobRef,
  v: { completion_notes: string | null; actual_minutes: number | null; materials: Material[] },
) {
  await enqueue('record', job.id, v);
  kickSync();
}

/** Raise a request from the phone (FR-WO-06), queued; the work order id is made here so the asset link
 *  and replays use the same row. */
export async function queueRequest(v: {
  orgId: string;
  siteId: string;
  title: string;
  description: string | null;
  priority: string;
  assetId?: string | null;
  locationId?: string | null;
  geom?: string | null;
}) {
  const id = crypto.randomUUID();
  await enqueue('request', null, { ...v, id });
  kickSync();
  return { id, number: '' };
}

export async function signedPhoto(bucket: 'photos' | 'sop-media', path: string) {
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** A step counts as answered the way wo_missing_steps sees it. */
export function isAnswered(step: Pick<JobStep, 'input_type' | 'value' | 'media_id'>) {
  if (step.input_type === 'photo') return !!step.media_id;
  if (step.input_type === 'tick') return step.value === true;
  return step.value !== null && step.value !== undefined && step.value !== '';
}
