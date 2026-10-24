import Dexie, { type EntityTable } from 'dexie';
import type { DayJob, FieldJob, ScannedAsset } from '../field/api';

// Field app offline store (FR-FLD-04, CLAUDE.md rule 5). Reads are cached here; every field write
// goes to the outbox first and is sent by the sync worker, each item with a client UUID.

export type OutboxKind = 'transition' | 'answer' | 'photo' | 'record' | 'request';
export type OutboxItem = {
  seq?: number;
  /** Client-generated UUID: the idempotency key sent with the write. */
  id: string;
  kind: OutboxKind;
  woId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  nextAt: number;
  status: 'pending' | 'failed';
  error?: string;
};
export type CachedAsset = Omit<ScannedAsset, 'jobs'> & { barcode: string | null };

class FieldDb extends Dexie {
  jobs!: EntityTable<{ id: string; data: FieldJob; savedAt: string }, 'id'>;
  days!: EntityTable<{ key: string; list: DayJob[]; savedAt: string }, 'key'>;
  assets!: EntityTable<CachedAsset, 'id'>;
  outbox!: EntityTable<OutboxItem, 'seq'>;
  blobs!: EntityTable<{ id: string; blob: Blob }, 'id'>;
  kv!: EntityTable<{ key: string; value: unknown; savedAt: string }, 'key'>;

  constructor() {
    super('tg-field');
    this.version(1).stores({
      jobs: 'id',
      days: 'key',
      assets: 'id, tag_code, barcode',
      outbox: '++seq, &id, status, woId',
      blobs: 'id',
      kv: 'key',
    });
  }
}

export const db = new FieldDb();

export const dayKey = (siteId: string, day: string) => `${siteId}|${day}`;

/** Drop everything (sign out or organisation switch): cached data must not leak to the next user. */
export async function clearOfflineStore() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
