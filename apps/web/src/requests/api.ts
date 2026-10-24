import { supabase } from '../lib/supabase';
import { check } from '../field/api';

// Item requests and the item catalogue (FR-REQ-01..05). Status changes only through ir_transition.

export const IR_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'sent',
  'acknowledged',
  'rejected_by_receiver',
  'fulfilled',
  'cancelled',
] as const;
export type IrStatus = (typeof IR_STATUSES)[number];
export const OPEN_STATUSES: IrStatus[] = ['draft', 'submitted', 'approved', 'sent', 'acknowledged'];
export const REASONS = ['maintain', 'replace', 'procure_new'] as const;
export const CATEGORIES = [
  'plant',
  'irrigation',
  'soil_amendment',
  'fertiliser',
  'pest_control',
  'hardware',
  'signage',
  'tools',
  'ppe',
  'other',
] as const;
export const UNITS = ['each', 'm', 'm2', 'm3', 'kg', 'L', 'bag'] as const;

export type Item = {
  id: string;
  code: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  unit: string;
  taxon_id: string | null;
  external_code: string | null;
  active: boolean;
};
export type IrListItem = {
  id: string;
  number: string;
  status: IrStatus;
  source: string;
  needed_by: string | null;
  created_at: string;
  location_code: string | null;
  work_order_number: string | null;
  requested_by_name: string | null;
  lines: number;
  reasons: string[];
  total_aed: number;
  summary: string | null;
};
export type IrLine = {
  id: string;
  line_no: number;
  item_id: string | null;
  item_code: string | null;
  description: string;
  reason: (typeof REASONS)[number];
  quantity: number;
  unit: string;
  est_unit_cost: number | null;
  asset_id: string | null;
  asset_tag: string | null;
};
export type IrEvent = {
  at: string;
  from: IrStatus | null;
  to: IrStatus;
  note: string | null;
  system: string | null;
  by: string | null;
};
export type IrDetail = {
  id: string;
  organisation_id: string;
  number: string;
  status: IrStatus;
  source: string;
  site_id: string;
  location_id: string | null;
  location_code: string | null;
  work_order_id: string | null;
  work_order_number: string | null;
  needed_by: string | null;
  notes: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  external_ref: string | null;
  total_aed: number;
  lines: IrLine[];
  events: IrEvent[];
};

export const fetchRequests = async (siteId: string, status?: IrStatus[]) =>
  check<IrListItem[]>(await supabase.rpc('ir_list', { p_site: siteId, p_status: status as never }));

export const fetchRequest = async (id: string) =>
  check<IrDetail | null>(await supabase.rpc('ir_detail', { p_ir: id }));

export const fetchIrAllowed = async (id: string) =>
  check<{ to_status: IrStatus; note_required: boolean }[]>(
    await supabase.rpc('ir_allowed_transitions', { p_ir: id }),
  );

export const irTransition = async (id: string, to: IrStatus, note?: string) =>
  check(
    await supabase.rpc('ir_transition', { p_ir: id, p_to: to as never, p_note: note || undefined }),
  );

export async function createRequest(v: {
  orgId: string;
  siteId: string;
  locationId: string | null;
  neededBy: string | null;
  notes: string | null;
}) {
  return check<{ id: string; number: string }>(
    await supabase
      .from('item_request')
      .insert({
        organisation_id: v.orgId,
        number: '', // assigned by the database (IR-YYYY-NNNNNN)
        site_id: v.siteId,
        location_id: v.locationId,
        source: 'manager',
        needed_by: v.neededBy,
        notes: v.notes,
      })
      .select('id, number')
      .single(),
  );
}

export async function updateRequest(
  id: string,
  v: { location_id: string | null; needed_by: string | null; notes: string | null },
) {
  check(await supabase.from('item_request').update(v).eq('id', id));
}

export async function deleteRequest(id: string) {
  check(await supabase.from('item_request').delete().eq('id', id));
}

export type LineInput = Omit<IrLine, 'id' | 'line_no' | 'item_code' | 'asset_tag'> & {
  id?: string;
};

export async function saveLine(
  req: Pick<IrDetail, 'id' | 'organisation_id' | 'lines'>,
  l: LineInput,
) {
  const row = {
    item_id: l.item_id,
    description: l.description,
    reason: l.reason,
    quantity: l.quantity,
    unit: l.unit,
    est_unit_cost: l.est_unit_cost,
    asset_id: l.asset_id,
  };
  if (l.id) check(await supabase.from('item_request_line').update(row).eq('id', l.id));
  else
    check(
      await supabase.from('item_request_line').insert({
        ...row,
        organisation_id: req.organisation_id,
        item_request_id: req.id,
        line_no: Math.max(0, ...req.lines.map((x) => x.line_no)) + 1,
      }),
    );
}

export async function deleteLine(id: string) {
  check(await supabase.from('item_request_line').delete().eq('id', id));
}

export const fetchItems = async (orgId: string) =>
  check<Item[]>(
    await supabase
      .from('item')
      .select('id, code, name, category, unit, taxon_id, external_code, active')
      .eq('organisation_id', orgId)
      .order('category')
      .order('name'),
  );

export async function saveItem(orgId: string, it: Omit<Item, 'id' | 'taxon_id'> & { id?: string }) {
  const { id, ...row } = it;
  if (id) check(await supabase.from('item').update(row).eq('id', id));
  else check(await supabase.from('item').insert({ ...row, organisation_id: orgId }));
}

export const generatePlantItems = async (orgId: string) =>
  check<number>(await supabase.rpc('item_generate_plants', { p_org: orgId }));

export const fetchSiteLocations = async (siteId: string) =>
  check<{ id: string; code: string }[]>(
    await supabase.from('location').select('id, code').eq('site_id', siteId).order('code'),
  );

/** Asset by tag for linking a line to the plant or asset being maintained or replaced. */
export async function assetIdByTag(orgId: string, tag: string) {
  const r = check<{ id: string }[]>(
    await supabase
      .from('asset')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('tag_code', tag.trim()),
  );
  return r[0]?.id ?? null;
}

/** Estimated total of lines (lines without a cost count as 0), as ir_total() in the database. */
export const lineTotal = (lines: Pick<IrLine, 'quantity' | 'est_unit_cost'>[]) =>
  lines.reduce((s, l) => s + l.quantity * (l.est_unit_cost ?? 0), 0);
