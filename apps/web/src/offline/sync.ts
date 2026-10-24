import { supabase } from '../lib/supabase';
import { check, type DayJob, type FieldJob } from '../field/api';
import { addDays, dubaiDate } from '../work/model';
import { db, dayKey, type CachedAsset, type OutboxItem } from './db';
import { setKick } from './kick';
import { processOutbox, wakeQueue, type Handlers } from './outbox';
import { OSM_TILES, warmTiles, type BBox } from './tiles';

// Sync worker (FR-FLD-04, NFR-03): sends the outbox in order, each write keyed by its client UUID so
// a replay after a lost answer changes nothing. Runs on start, when the phone comes back online,
// after each new item and every 30 s.

// Payloads were written by field/api.ts; fields are read as the shapes queued there.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = (it: OutboxItem) => it.payload as Record<string, any>;

export const handlers: Handlers = {
  async transition(it) {
    // wo_transition returns the original result for a client_uuid it has already seen.
    check(
      await supabase.rpc('wo_transition', {
        p_wo: it.woId!,
        p_to: p(it).to,
        p_note: p(it).note ?? undefined,
        p_client_uuid: it.id,
      }),
    );
  },
  async answer(it) {
    // Upsert on (work_order_id, sop_step_id): sending it twice leaves the same answer.
    const row: Record<string, unknown> = {
      organisation_id: p(it).org,
      work_order_id: it.woId,
      sop_step_id: p(it).stepId,
    };
    if ('value' in it.payload) row.value = p(it).value;
    if (p(it).mediaId) row.media_id = p(it).mediaId;
    check(
      await supabase
        .from('sop_response')
        .upsert(row as never, { onConflict: 'work_order_id,sop_step_id' }),
    );
  },
  async photo(it) {
    const blob = (await db.blobs.get(p(it).mediaId))?.blob;
    if (blob) {
      const up = await supabase.storage
        .from('photos')
        .upload(p(it).path, blob, { contentType: 'image/jpeg' });
      // Same path on a replay: "already exists" means the first attempt arrived.
      const status = Number((up.error as { statusCode?: string } | null)?.statusCode ?? 0);
      if (up.error && status !== 409 && !/exists|duplicate/i.test(up.error.message))
        throw Object.assign(new Error(up.error.message), { status: status || undefined });
    }
    check(
      await supabase.from('media').upsert(
        {
          id: p(it).mediaId,
          organisation_id: p(it).org,
          bucket: 'photos',
          path: p(it).path,
          kind: 'photo',
          work_order_id: it.woId,
          taken_at: p(it).takenAt,
          caption: p(it).caption,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      ),
    );
  },
  async record(it) {
    check(
      await supabase
        .from('work_order')
        .update({
          completion_notes: p(it).completion_notes,
          actual_minutes: p(it).actual_minutes,
          materials: p(it).materials,
        })
        .eq('id', it.woId!),
    );
  },
  async request(it) {
    const v = p(it);
    check(
      await supabase.from('work_order').upsert(
        {
          id: v.id,
          organisation_id: v.orgId,
          number: '', // assigned by the database
          site_id: v.siteId,
          source: 'request',
          wo_type: 'reactive',
          title: v.title,
          description: v.description,
          priority: v.priority,
          status: 'requested',
          location_id: v.locationId ?? null,
          geom: v.geom ?? null,
          client_uuid: it.id,
        },
        { onConflict: 'client_uuid', ignoreDuplicates: true },
      ),
    );
    if (v.assetId)
      check(
        await supabase.from('work_order_asset').upsert(
          { organisation_id: v.orgId, work_order_id: v.id, asset_id: v.assetId },
          {
            onConflict: 'work_order_id,asset_id',
            ignoreDuplicates: true,
          },
        ),
      );
  },
};

type Pack = {
  generated_at: string;
  days: Record<string, DayJob[]>;
  jobs: FieldJob[];
  assets: CachedAsset[];
  bbox: BBox | null;
};

/** Keep today's and tomorrow's work, its jobs and the assets of those zones on the phone, and warm the
 *  map tile cache for the site once. */
export async function refreshPack(siteId: string, basemapUrl?: string | null) {
  const today = dubaiDate(new Date());
  const pack = check<Pack>(
    await supabase.rpc('field_offline_pack', {
      p_site: siteId,
      p_from: today,
      p_to: addDays(today, 1),
    }),
  );
  const savedAt = new Date().toISOString();
  await db.transaction('rw', db.days, db.jobs, db.assets, db.kv, async () => {
    await db.days.bulkPut(
      Object.entries(pack.days).map(([day, list]) => ({ key: dayKey(siteId, day), list, savedAt })),
    );
    await db.jobs.bulkPut(
      pack.jobs.filter(Boolean).map((data) => ({ id: data.id, data, savedAt })),
    );
    await db.assets.clear();
    await db.assets.bulkPut(pack.assets);
    await db.kv.put({
      key: `pack:${siteId}`,
      value: { jobs: pack.jobs.length, assets: pack.assets.length },
      savedAt,
    });
  });
  const tilesKey = `tiles:${siteId}`;
  if (pack.bbox && !(await db.kv.get(tilesKey))) {
    const n = await warmTiles(pack.bbox, [OSM_TILES, ...(basemapUrl ? [basemapUrl] : [])]);
    if (n > 0) await db.kv.put({ key: tilesKey, value: n, savedAt });
  }
  return { jobs: pack.jobs.length, assets: pack.assets.length, savedAt };
}

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
const run = () => void processOutbox(handlers).catch(() => undefined);

/** Start the worker once per page. */
export function startSync() {
  if (started) return;
  started = true;
  setKick(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 50);
  });
  window.addEventListener('online', () => void wakeQueue().then(run));
  setInterval(run, 30_000);
  run();
}
