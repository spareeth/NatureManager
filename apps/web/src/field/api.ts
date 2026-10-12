import { supabase } from '../lib/supabase';
import type { Json } from '../types/db';
import type { WoDetail } from '../work/api';
import type { WoStatus } from '../work/model';
import { compressImage } from './image';

function check<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
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
  photos: { id: string; path: string; caption: string | null; taken_at: string | null }[];
};

export const fetchMyDay = async (siteId: string, day: string) =>
  check<DayJob[]>(await supabase.rpc('field_my_day', { p_site: siteId, p_day: day }));

export const fetchJob = async (id: string) =>
  check<FieldJob | null>(await supabase.rpc('field_job', { p_wo: id }));

/** Status change through wo_transition, with a client UUID so a retried tap is not applied twice. */
export const moveJob = async (id: string, to: WoStatus, note?: string) =>
  check(
    await supabase.rpc('wo_transition', {
      p_wo: id,
      p_to: to as never,
      p_note: note || undefined,
      p_client_uuid: crypto.randomUUID(),
    }),
  );

export async function answerStep(
  job: Pick<FieldJob, 'id' | 'organisation_id'>,
  stepId: string,
  answer: { value?: Json | null; mediaId?: string | null },
) {
  check(
    await supabase.from('sop_response').upsert(
      {
        organisation_id: job.organisation_id,
        work_order_id: job.id,
        sop_step_id: stepId,
        value: (answer.value ?? null) as never,
        media_id: answer.mediaId ?? null,
      },
      { onConflict: 'work_order_id,sop_step_id' },
    ),
  );
}

/** Compress (max 1600 px), upload to photos/<org>/wo/<wo>/ and register the media row. */
export async function uploadJobPhoto(
  job: Pick<FieldJob, 'id' | 'organisation_id'>,
  file: File,
  caption?: string,
) {
  const blob = await compressImage(file);
  const path = `${job.organisation_id}/wo/${job.id}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage
    .from('photos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  return check<{ id: string; path: string }>(
    await supabase
      .from('media')
      .insert({
        organisation_id: job.organisation_id,
        bucket: 'photos',
        path,
        kind: 'photo',
        work_order_id: job.id,
        taken_at: new Date().toISOString(),
        caption: caption || null,
      })
      .select('id, path')
      .single(),
  );
}

export async function signedPhoto(bucket: 'photos' | 'sop-media', path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function saveJobRecord(
  id: string,
  v: { completion_notes: string | null; actual_minutes: number | null; materials: Material[] },
) {
  check(
    await supabase
      .from('work_order')
      .update({ ...v, materials: v.materials as unknown as NonNullable<Json> })
      .eq('id', id),
  );
}

/** A step counts as answered the way wo_missing_steps sees it. */
export function isAnswered(step: Pick<JobStep, 'input_type' | 'value' | 'media_id'>) {
  if (step.input_type === 'photo') return !!step.media_id;
  if (step.input_type === 'tick') return step.value === true;
  return step.value !== null && step.value !== undefined && step.value !== '';
}

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

export const fetchScan = async (assetId: string) =>
  check<ScannedAsset | null>(await supabase.rpc('field_scan', { p_asset: assetId }));
