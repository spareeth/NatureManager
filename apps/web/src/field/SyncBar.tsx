import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../offline/db';
import { discardItem, retryItem, useOutbox, wakeQueue } from '../offline/outbox';
import { refreshPack, startSync } from '../offline/sync';
import { kickSync } from '../offline/kick';

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Connection, queued changes and offline data for the shift (FR-FLD-04). Starts the sync worker. */
export function SyncBar({ siteId }: { siteId?: string }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const items = useOutbox();
  const queryClient = useQueryClient();
  // Shift data: refreshed when the field app opens with network, and on request.
  const saved = useQuery({
    queryKey: ['field-pack-saved', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const r = await db.kv.get(`pack:${siteId}`);
      return r ? { savedAt: r.savedAt, ...(r.value as { jobs: number; assets: number }) } : null;
    },
  });
  const fresh = useQuery({
    queryKey: ['field-pack', siteId],
    enabled: !!siteId && online,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: () => refreshPack(siteId!),
  });
  const pack = fresh.data ?? saved.data ?? null;
  const pending = items.filter((i) => i.status === 'pending');
  const failed = items.filter((i) => i.status === 'failed');

  useEffect(() => startSync(), []);
  // When the queue empties, show the server's view again.
  useEffect(() => {
    if (!online || pending.length > 0) return;
    for (const key of ['field-job', 'field-day', 'field-scan', 'field-verify'])
      void queryClient.invalidateQueries({ queryKey: [key] });
  }, [online, pending.length, queryClient]);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Dubai',
    });

  return (
    <div className="border-b bg-gray-50 px-3 py-2 text-sm" data-testid="sync-bar">
      <div className="mx-auto flex max-w-xl flex-wrap items-center gap-2">
        <span
          role="status"
          className={`rounded-full px-2 py-1 font-semibold ${online ? 'bg-green-100 text-green-900' : 'bg-amber-200 text-amber-950'}`}
        >
          {online ? t('fieldApp.online') : t('fieldApp.offline')}
        </span>
        <span>
          {pending.length > 0
            ? t('fieldApp.waiting', { count: pending.length })
            : t('fieldApp.allSent')}
        </span>
        {pending.length > 0 && online && (
          <button
            type="button"
            className="min-h-12 rounded border px-3"
            onClick={() => void wakeQueue().then(kickSync)}
          >
            {t('fieldApp.syncNow')}
          </button>
        )}
        <span className="ms-auto text-gray-700">
          {pack
            ? t('fieldApp.packSaved', {
                time: time(pack.savedAt),
                jobs: pack.jobs,
                assets: pack.assets,
              })
            : t('fieldApp.packNone')}
        </span>
        {online && (
          <button
            type="button"
            disabled={fresh.isFetching}
            className="min-h-12 rounded border px-3 disabled:opacity-50"
            onClick={() => void fresh.refetch()}
          >
            {fresh.isFetching ? t('common.loading') : t('fieldApp.packUpdate')}
          </button>
        )}
      </div>
      {fresh.error && <p className="mx-auto max-w-xl text-red-700">{fresh.error.message}</p>}
      {failed.length > 0 && (
        <div role="alert" className="mx-auto mt-2 max-w-xl rounded bg-red-50 p-2 text-red-900">
          <p className="font-semibold">{t('fieldApp.failed', { count: failed.length })}</p>
          <ul className="mt-1 space-y-1">
            {failed.map((f) => (
              <li key={f.seq} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {t(`fieldApp.kind.${f.kind}`)}: {f.error}
                </span>
                <button
                  type="button"
                  className="min-h-12 rounded border px-3"
                  onClick={() => void retryItem(f.seq!).then(kickSync)}
                >
                  {t('fieldApp.retry')}
                </button>
                <button
                  type="button"
                  className="min-h-12 rounded border px-3"
                  onClick={() => void discardItem(f.seq!)}
                >
                  {t('fieldApp.discard')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
