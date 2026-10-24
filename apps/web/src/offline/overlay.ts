import { isAnswered, type FieldJob, type JobStep, type Material } from '../field/api';
import type { WoStatus } from '../work/model';
import type { OutboxItem } from './db';

/** Field status moves, mirroring the wo_transition_rule rows for the assignee and field manager
 *  (migration 20261012000200). The server still checks every move when it syncs. */
const FIELD_MOVES: Partial<Record<WoStatus, WoStatus[]>> = {
  scheduled: ['in_progress'],
  in_progress: ['on_hold', 'completed'],
  on_hold: ['in_progress'],
};

export function fieldMoves(status: WoStatus, mine: boolean, fieldManager: boolean): WoStatus[] {
  return mine || fieldManager ? (FIELD_MOVES[status] ?? []) : [];
}

export type LocalPhoto = {
  id: string;
  path: string | null;
  caption: string | null;
  taken_at: string | null;
  blobId?: string;
};

/** The job as the phone should show it: the last known server copy with the changes still waiting
 *  in the outbox applied on top, in order. Failed items are not applied. */
export function applyPending(job: FieldJob, items: OutboxItem[]): FieldJob {
  const mine = items
    .filter((i) => i.woId === job.id && i.status === 'pending')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  if (!mine.length) return job;
  let j: FieldJob = { ...job, steps: job.steps.map((s) => ({ ...s })), photos: [...job.photos] };
  for (const it of mine) {
    const p = it.payload;
    if (it.kind === 'transition') j = { ...j, status: p.to as WoStatus };
    if (it.kind === 'record')
      j = {
        ...j,
        completion_notes: (p.completion_notes as string | null) ?? null,
        actual_minutes: (p.actual_minutes as number | null) ?? null,
        materials: (p.materials as Material[]) ?? [],
      };
    if (it.kind === 'photo')
      j.photos.push({
        id: p.mediaId as string,
        path: null,
        caption: (p.caption as string) ?? null,
        taken_at: p.takenAt as string,
        blobId: p.mediaId as string,
      } as LocalPhoto);
    if (it.kind === 'answer') {
      const s = j.steps.find((x) => x.id === p.stepId);
      if (s) {
        if ('value' in p) s.value = (p.value as JobStep['value']) ?? null;
        if (p.mediaId) {
          s.media_id = p.mediaId as string;
          (s as JobStep & { blobId?: string }).blobId = p.mediaId as string;
        }
      }
    }
  }
  j.missing = j.steps.filter((s) => s.required && !isAnswered(s)).map((s) => s.seq);
  return j;
}
