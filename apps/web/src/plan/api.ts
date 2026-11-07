import { supabase } from '../lib/supabase';
import type { Json } from '../types/db';
import type { Rule } from './rule';

function check<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

export type I18nText = { en: string; ar?: string };
export type LibraryRow = {
  code: string;
  current: {
    id: string;
    version: number;
    title: I18nText;
    approved_at: string;
    steps: number;
  } | null;
  draft: { id: string; version: number; title: I18nText; steps: number } | null;
  retired: number;
  templates: number;
};
export type Sop = {
  id: string;
  organisation_id: string;
  code: string;
  version: number;
  title: I18nText;
  purpose: I18nText | null;
  ppe: string[] | null;
  hazards: string[] | null;
  status: 'draft' | 'approved' | 'retired';
  approved_at: string | null;
};
export type Step = {
  id: string;
  sop_id: string;
  seq: number;
  text: I18nText;
  input_type: 'tick' | 'number' | 'text' | 'photo' | 'choice';
  choices: string[] | null;
  unit: string | null;
  required: boolean;
  media_path: string | null;
};
export type Template = {
  id: string;
  code: string;
  title: string;
  wo_type: string;
  default_priority: string;
  sop_id: string | null;
  team_id: string | null;
  est_minutes: number | null;
};
export type Schedule = {
  id: string;
  template_id: string;
  target_kind: 'asset' | 'asset_type_in_location' | 'location';
  target_asset_id: string | null;
  target_asset_type_id: string | null;
  target_location_id: string | null;
  rule: Rule;
  max_per_day: number | null;
  horizon_days: number;
  active: boolean;
  last_generated_until: string | null;
};

export const fetchLibrary = async (orgId: string) =>
  check<LibraryRow[]>(await supabase.rpc('sop_library', { p_org: orgId }));

export async function fetchSop(id: string) {
  const sop = check<Sop>(await supabase.from('sop').select('*').eq('id', id).single());
  const steps = check<Step[]>(
    await supabase.from('sop_step').select('*').eq('sop_id', id).order('seq'),
  );
  return { sop, steps };
}

export async function createSop(orgId: string, code: string, title: I18nText) {
  return check<{ id: string }>(
    await supabase
      .from('sop')
      .insert({ organisation_id: orgId, code, title: title as unknown as NonNullable<Json> })
      .select('id')
      .single(),
  ).id;
}

export async function updateSop(
  id: string,
  v: Partial<Pick<Sop, 'title' | 'purpose' | 'ppe' | 'hazards'>>,
) {
  check(
    await supabase
      .from('sop')
      .update(v as never)
      .eq('id', id)
      .select('id')
      .single(),
  );
}

export async function saveStep(
  orgId: string,
  sopId: string,
  s: Omit<Step, 'id' | 'sop_id'> & { id?: string },
) {
  const row = {
    text: s.text as unknown as NonNullable<Json>,
    input_type: s.input_type,
    choices: s.input_type === 'choice' ? s.choices : null,
    unit: s.unit,
    required: s.required,
    media_path: s.media_path,
  };
  if (s.id)
    return check(await supabase.from('sop_step').update(row).eq('id', s.id).select('id').single());
  return check(
    await supabase
      .from('sop_step')
      .insert({ ...row, organisation_id: orgId, sop_id: sopId, seq: s.seq })
      .select('id')
      .single(),
  );
}

export const deleteStep = async (id: string) =>
  check(await supabase.from('sop_step').delete().eq('id', id));
export const reorderSteps = async (sopId: string, ids: string[]) =>
  check(await supabase.rpc('sop_reorder', { p_sop: sopId, p_steps: ids }));
export const newVersion = async (sopId: string) =>
  check<string>(await supabase.rpc('sop_new_version', { p_sop: sopId }));
export const approveSop = async (sopId: string) =>
  check(await supabase.rpc('sop_approve', { p_sop: sopId }));
export const deleteDraft = async (sopId: string) =>
  check(await supabase.from('sop').delete().eq('id', sopId));

/** Step image in the private sop-media bucket under <organisation>/sops/<sop>/. */
export async function uploadStepImage(orgId: string, sopId: string, file: File) {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${orgId}/sops/${sopId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('sop-media')
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedStepImage(path: string) {
  const { data } = await supabase.storage.from('sop-media').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export const fetchTemplates = async (orgId: string) =>
  check<Template[]>(
    await supabase
      .from('wo_template')
      .select('id, code, title, wo_type, default_priority, sop_id, team_id, est_minutes')
      .eq('organisation_id', orgId)
      .order('code'),
  );

export async function saveTemplate(orgId: string, t: Omit<Template, 'id'> & { id?: string }) {
  const { id, ...row } = t;
  if (id)
    return check(await supabase.from('wo_template').update(row).eq('id', id).select('id').single());
  return check(
    await supabase
      .from('wo_template')
      .insert({ ...row, organisation_id: orgId })
      .select('id')
      .single(),
  );
}

export const fetchSchedules = async (orgId: string) =>
  check<Schedule[]>(
    await supabase.from('pm_schedule').select('*').eq('organisation_id', orgId).order('created_at'),
  );

export async function saveSchedule(
  orgId: string,
  s: Omit<Schedule, 'id' | 'last_generated_until'> & { id?: string },
) {
  const { id, ...rest } = s;
  const row = { ...rest, rule: rest.rule as unknown as NonNullable<Json> };
  if (id)
    return check(await supabase.from('pm_schedule').update(row).eq('id', id).select('id').single());
  return check(
    await supabase
      .from('pm_schedule')
      .insert({ ...row, organisation_id: orgId })
      .select('id')
      .single(),
  );
}

export const deleteSchedule = async (id: string) =>
  check(await supabase.from('pm_schedule').delete().eq('id', id));

export const generateNow = async (orgId: string) =>
  check<{ created: number; existing: number; over_capacity: number; schedules: number }>(
    await supabase.rpc('pm_generate', { p_org: orgId }),
  );

export async function fetchPickLists(orgId: string, siteId: string) {
  const [locations, types, teams, sops] = await Promise.all([
    supabase.from('location').select('id, code, kind').eq('site_id', siteId).order('code'),
    supabase
      .from('asset_type')
      .select('id, code, name, name_ar')
      .eq('organisation_id', orgId)
      .order('name'),
    supabase.from('team').select('id, name').eq('organisation_id', orgId).order('name'),
    supabase
      .from('sop')
      .select('id, code, version, status, title')
      .eq('organisation_id', orgId)
      .neq('status', 'retired')
      .order('code'),
  ]);
  return {
    locations: check<{ id: string; code: string; kind: string }[]>(locations),
    types: check<{ id: string; code: string; name: string; name_ar: string | null }[]>(types),
    teams: check<{ id: string; name: string }[]>(teams),
    sops: check<{ id: string; code: string; version: number; status: string; title: I18nText }[]>(
      sops,
    ),
  };
}
