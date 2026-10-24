import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type OutboxItem } from './db';
import { backoffMs, isTransient } from './errors';
import { discardItem, enqueue, processOutbox, retryItem, type Handlers } from './outbox';
import { applyPending, fieldMoves } from './overlay';
import { tilesFor } from './tiles';
import type { FieldJob } from '../field/api';

const pgError = (code: string) => Object.assign(new Error('refused'), { code });
const netError = () => new TypeError('Failed to fetch');

function handlers(over: Partial<Handlers> = {}): Handlers & { calls: string[] } {
  const calls: string[] = [];
  const ok = async (it: OutboxItem) => void calls.push(`${it.kind}:${it.id}`);
  return {
    calls,
    transition: ok,
    answer: ok,
    photo: ok,
    record: ok,
    request: ok,
    ...over,
  } as Handlers & { calls: string[] };
}

beforeEach(async () => {
  await db.outbox.clear();
  await db.blobs.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('retry rules', () => {
  it('network trouble and server errors are retried, refusals are not', () => {
    expect(isTransient(netError())).toBe(true);
    expect(isTransient(Object.assign(new Error('x'), { status: 503 }))).toBe(true);
    expect(isTransient(Object.assign(new Error('jwt expired'), { status: 401 }))).toBe(true);
    expect(isTransient(pgError('42501'))).toBe(false);
    expect(isTransient(pgError('22023'))).toBe(false);
    expect(isTransient(Object.assign(new Error('x'), { status: 400 }))).toBe(false);
  });
  it('anything fails as transient while the phone says it is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isTransient(pgError('42501'))).toBe(true);
  });
  it('backs off 2 s, 4 s, 8 s up to 5 minutes', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([2000, 4000, 8000]);
    expect(backoffMs(20)).toBe(300_000);
  });
});

describe('outbox', () => {
  it('sends in order with the client UUID and empties the queue', async () => {
    const a = await enqueue('transition', 'w1', { to: 'in_progress' });
    const b = await enqueue('answer', 'w1', { stepId: 's1', value: true });
    const h = handlers();
    expect(await processOutbox(h)).toEqual({ sent: 2, failed: 0, waiting: 0 });
    expect(h.calls).toEqual([`transition:${a.id}`, `answer:${b.id}`]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a network failure keeps the order and waits with back-off', async () => {
    await enqueue('transition', 'w1', { to: 'in_progress' });
    await enqueue('answer', 'w1', { stepId: 's1', value: true });
    const h = handlers({ transition: async () => Promise.reject(netError()) });
    let t = 1000;
    const r = await processOutbox(h, () => t);
    expect(r).toEqual({ sent: 0, failed: 0, waiting: 2 });
    const first = (await db.outbox.orderBy('seq').first())!;
    expect(first.attempts).toBe(1);
    expect(first.nextAt).toBe(3000);
    expect(h.calls).toEqual([]); // the answer is not sent ahead of the status change
    t = 2000;
    expect((await processOutbox(handlers(), () => t)).sent).toBe(0); // still waiting
    t = 3000;
    expect((await processOutbox(handlers(), () => t)).sent).toBe(2);
  });

  it('a refusal marks the item failed and the rest still go; retry and discard', async () => {
    await enqueue('transition', 'w1', { to: 'completed' });
    await enqueue('record', 'w1', { completion_notes: 'x' });
    const r = await processOutbox(
      handlers({ transition: async () => Promise.reject(pgError('22023')) }),
    );
    expect(r).toEqual({ sent: 1, failed: 1, waiting: 0 });
    const failed = (await db.outbox.toArray())[0]!;
    expect(failed.status).toBe('failed');
    await retryItem(failed.seq!);
    expect((await processOutbox(handlers())).sent).toBe(1);
    await enqueue('photo', 'w1', { mediaId: 'm1' });
    await db.blobs.put({ id: 'm1', blob: new Blob(['x']) });
    const ph = (await db.outbox.toArray())[0]!;
    await discardItem(ph.seq!);
    expect(await db.blobs.count()).toBe(0);
  });

  it('a sent photo removes its stored blob', async () => {
    await db.blobs.put({ id: 'm2', blob: new Blob(['x']) });
    await enqueue('photo', 'w1', { mediaId: 'm2' });
    await processOutbox(handlers());
    expect(await db.blobs.get('m2')).toBeUndefined();
  });

  it('200 queued items sync well inside a minute (NFR-03, handler time excluded)', async () => {
    for (let i = 0; i < 200; i++) await enqueue('answer', 'w1', { stepId: `s${i}`, value: i });
    const t0 = performance.now();
    expect((await processOutbox(handlers())).sent).toBe(200);
    expect(performance.now() - t0).toBeLessThan(60_000);
  });
});

const JOB = {
  id: 'w1',
  status: 'scheduled',
  steps: [
    { id: 's1', seq: 1, input_type: 'tick', required: true, value: null, media_id: null },
    { id: 's2', seq: 2, input_type: 'photo', required: true, value: null, media_id: null },
  ],
  photos: [],
  missing: [1, 2],
  materials: [],
  completion_notes: null,
  actual_minutes: null,
} as unknown as FieldJob;
const item = (
  seq: number,
  kind: OutboxItem['kind'],
  payload: Record<string, unknown>,
  status: OutboxItem['status'] = 'pending',
): OutboxItem => ({
  seq,
  id: `u${seq}`,
  kind,
  woId: 'w1',
  payload,
  createdAt: '',
  attempts: 0,
  nextAt: 0,
  status,
});

describe('overlay of queued changes', () => {
  it('applies status, answers, photos and the record in order and recomputes what is missing', () => {
    const j = applyPending(JOB, [
      item(1, 'transition', { to: 'in_progress' }),
      item(2, 'answer', { stepId: 's1', value: true }),
      item(3, 'photo', { mediaId: 'm1', caption: 'after', takenAt: 't' }),
      item(4, 'answer', { stepId: 's2', mediaId: 'm1' }),
      item(5, 'record', {
        completion_notes: 'done',
        actual_minutes: 30,
        materials: [{ item: 'mulch' }],
      }),
    ]);
    expect(j.status).toBe('in_progress');
    expect(j.missing).toEqual([]);
    expect(j.photos).toHaveLength(1);
    expect(j.photos[0]!.blobId).toBe('m1');
    expect(j.steps[1]!.blobId).toBe('m1');
    expect(j.completion_notes).toBe('done');
    expect(JOB.steps[0]!.value).toBeNull(); // the cached copy is not changed
  });
  it('ignores failed items and other jobs', () => {
    const j = applyPending(JOB, [
      item(1, 'transition', { to: 'in_progress' }, 'failed'),
      { ...item(2, 'transition', { to: 'on_hold' }), woId: 'w9' },
    ]);
    expect(j).toBe(JOB);
  });
  it('field moves follow the transition table for the assignee and field manager', () => {
    expect(fieldMoves('scheduled', true, false)).toEqual(['in_progress']);
    expect(fieldMoves('in_progress', false, true)).toEqual(['on_hold', 'completed']);
    expect(fieldMoves('in_progress', false, false)).toEqual([]);
    expect(fieldMoves('completed', true, false)).toEqual([]);
  });
});

describe('tiles', () => {
  it('covers the Terra Garden extent at zoom 15 to 19 with a few dozen tiles', () => {
    const tiles = tilesFor([55.1533, 24.958, 55.1555, 24.9599]);
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set([15, 16, 17, 18, 19]));
    expect(tiles.length).toBeGreaterThan(5);
    expect(tiles.length).toBeLessThan(60);
    expect(tiles.find((t) => t.z === 15)).toEqual({ z: 15, x: 21404, y: 14036 });
  });
});
