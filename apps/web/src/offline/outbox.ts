import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type OutboxItem, type OutboxKind } from './db';
import { backoffMs, isTransient } from './errors';

export type Handler = (item: OutboxItem) => Promise<void>;
export type Handlers = Record<OutboxKind, Handler>;

/** Queue a write. Returns the item (its id is the client UUID used for idempotent replay). */
export async function enqueue(
  kind: OutboxKind,
  woId: string | null,
  payload: Record<string, unknown>,
  id = crypto.randomUUID(),
) {
  const item: OutboxItem = {
    id,
    kind,
    woId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAt: 0,
    status: 'pending',
  };
  item.seq = await db.outbox.add(item);
  return item;
}

let running: Promise<SyncResult> | null = null;
export type SyncResult = { sent: number; failed: number; waiting: number };

/** Send queued items in order. A network or server problem stops the run and schedules a retry with
 *  back-off (order is kept); a refusal by the server marks the item failed and moves on. */
export function processOutbox(handlers: Handlers, now = () => Date.now()): Promise<SyncResult> {
  running ??= (async () => {
    const result: SyncResult = { sent: 0, failed: 0, waiting: 0 };
    try {
      for (;;) {
        const item = await db.outbox
          .where('status')
          .equals('pending')
          .sortBy('seq')
          .then((x) => x[0]);
        if (!item) break;
        if (item.nextAt > now()) {
          result.waiting = await db.outbox.where('status').equals('pending').count();
          break;
        }
        try {
          await handlers[item.kind](item);
          await db.outbox.delete(item.seq!);
          if (item.kind === 'photo') await db.blobs.delete(item.payload.mediaId as string);
          result.sent++;
        } catch (e) {
          const attempts = item.attempts + 1;
          if (isTransient(e)) {
            await db.outbox.update(item.seq!, {
              attempts,
              nextAt: now() + backoffMs(attempts),
              error: (e as Error).message,
            });
            result.waiting = await db.outbox.where('status').equals('pending').count();
            break;
          }
          await db.outbox.update(item.seq!, {
            attempts,
            status: 'failed',
            error: (e as Error).message,
          });
          result.failed++;
        }
      }
    } finally {
      running = null;
    }
    return result;
  })();
  return running;
}

/** Put failed items back in the queue (after the cause is fixed) or drop them. */
export const retryItem = (seq: number) =>
  db.outbox.update(seq, { status: 'pending', nextAt: 0, error: undefined });
export async function discardItem(seq: number) {
  const it = await db.outbox.get(seq);
  if (it?.kind === 'photo') await db.blobs.delete(it.payload.mediaId as string);
  await db.outbox.delete(seq);
}
/** Retry now: clear the back-off of waiting items. */
export const wakeQueue = () => db.outbox.where('status').equals('pending').modify({ nextAt: 0 });

/** Live view of the outbox for the sync bar and job overlays. */
export function useOutbox(): OutboxItem[] {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => db.outbox.orderBy('seq').toArray()).subscribe({
      next: setItems,
      error: () => setItems([]),
    });
    return () => sub.unsubscribe();
  }, []);
  return items;
}
