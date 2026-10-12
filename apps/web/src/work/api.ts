import { supabase } from '../lib/supabase';
import type { BoardItem, WoStatus } from './model';

function check<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code });
  return res.data as T;
}

export type WoEvent = {
  at: string;
  from: WoStatus | null;
  to: WoStatus;
  note: string | null;
  source: 'user' | 'system';
  by: string | null;
};
export type WoDetail = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: WoStatus;
  priority: string;
  wo_type: string;
  source: string;
  site_id: string;
  planned_start: string | null;
  planned_end: string | null;
  due_at: string | null;
  est_minutes: number | null;
  actual_minutes: number | null;
  materials: { item: string; qty?: number; unit?: string }[];
  completion_notes: string | null;
  created_at: string;
  created_by_name: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  team_id: string | null;
  team_name: string | null;
  location: { id: string; code: string } | null;
  sop: { id: string; code: string; version: number; title: { en: string; ar?: string } } | null;
  template_code: string | null;
  lon: number | null;
  lat: number | null;
  sla_due: string;
  assets: { id: string; tag_code: string }[];
  events: WoEvent[];
};
export type People = {
  members: { user_id: string; name: string; roles: string[]; team_id: string | null }[];
  teams: { id: string; name: string; discipline: string }[];
};

export async function fetchBoard(
  siteId: string,
  opts: { status?: WoStatus[]; from?: string; to?: string; openOnly?: boolean } = {},
) {
  return check<BoardItem[]>(
    await supabase.rpc('wo_board', {
      p_site: siteId,
      p_status: opts.status as never,
      p_from: opts.from,
      p_to: opts.to,
      p_open_only: opts.openOnly ?? false,
    }),
  );
}

export async function fetchWorkOrder(id: string) {
  return check<WoDetail | null>(await supabase.rpc('wo_detail', { p_wo: id }));
}

export async function fetchPeople(orgId: string) {
  return check<People>(await supabase.rpc('wo_people', { p_org: orgId }));
}

export async function fetchAllowed(id: string) {
  return check<{ to_status: WoStatus; note_required: boolean }[]>(
    await supabase.rpc('wo_allowed_transitions', { p_wo: id }),
  );
}

export async function transition(id: string, to: WoStatus, note?: string) {
  return check(
    await supabase.rpc('wo_transition', { p_wo: id, p_to: to as never, p_note: note || undefined }),
  );
}

export async function schedule(
  id: string,
  v: {
    assignee: string | null;
    team: string | null;
    start: string;
    minutes?: number | null;
    note?: string;
  },
) {
  return check(
    await supabase.rpc('wo_schedule', {
      p_wo: id,
      p_assignee: v.assignee as never,
      p_team: v.team as never,
      p_start: v.start,
      p_minutes: v.minutes ?? undefined,
      p_note: v.note || undefined,
    }),
  );
}

export async function replan(id: string, start: string) {
  check(await supabase.rpc('wo_replan', { p_wo: id, p_start: start }));
}

export async function bulkMove(siteId: string, from: string, to: string) {
  return check<number>(
    await supabase.rpc('wo_bulk_move', { p_site: siteId, p_from: from, p_to: to }),
  );
}

export async function raiseRequest(v: {
  orgId: string;
  siteId: string;
  title: string;
  description: string | null;
  priority: string;
  locationId?: string | null;
  assetId?: string | null;
  geom?: string | null;
}) {
  const row = check<{ id: string; number: string }>(
    await supabase
      .from('work_order')
      .insert({
        organisation_id: v.orgId,
        number: '', // assigned by the database (WO-YYYY-NNNNNN)
        site_id: v.siteId,
        source: 'request',
        wo_type: 'reactive',
        title: v.title,
        description: v.description,
        priority: v.priority,
        status: 'requested',
        location_id: v.locationId ?? null,
        geom: (v.geom ?? null) as never,
      })
      .select('id, number')
      .single(),
  );
  if (v.assetId) {
    check(
      await supabase
        .from('work_order_asset')
        .insert({ organisation_id: v.orgId, work_order_id: row.id, asset_id: v.assetId }),
    );
  }
  return row;
}
