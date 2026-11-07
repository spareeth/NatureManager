import { supabase } from '../lib/supabase';
import { check } from '../field/api';
import type { ExportRow } from './format';

export const fetchPreview = async (orgId: string) =>
  check<ExportRow[]>(await supabase.rpc('ir_export_rows', { p_org: orgId }));

/** Take every approved, unsent line as one batch (marks the requests sent). */
export const exportBatch = async (orgId: string) =>
  check<{ batch_id: string | null; rows: ExportRow[] }>(
    await supabase.rpc('ir_export', { p_org: orgId }),
  );

export const fetchBatchRows = async (orgId: string, batchId: string) =>
  check<ExportRow[]>(await supabase.rpc('ir_export_rows', { p_org: orgId, p_batch: batchId }));

export type Batch = {
  batch_id: string;
  sent_at: string;
  channel: string;
  requests: number;
  lines: number;
};
export const fetchBatches = async (orgId: string) =>
  check<Batch[]>(await supabase.rpc('ir_batches', { p_org: orgId }));

export type Receiver = {
  id: string;
  name: string;
  channel: string;
  active: boolean;
  created_at: string;
};
export const fetchReceivers = async (orgId: string) =>
  check<Receiver[]>(
    await supabase
      .from('integration_receiver')
      .select('id, name, channel, active, created_at')
      .eq('organisation_id', orgId)
      .order('name'),
  );

export const createReceiver = async (orgId: string, name: string) =>
  check<{ id: string; api_key: string }>(
    await supabase.rpc('receiver_create', { p_org: orgId, p_name: name }),
  );

export const rotateKey = async (id: string) =>
  check<string>(await supabase.rpc('receiver_rotate_key', { p_receiver: id }));

export async function setReceiverActive(id: string, active: boolean) {
  check(await supabase.from('integration_receiver').update({ active }).eq('id', id));
}
