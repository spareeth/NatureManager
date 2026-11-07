import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  createReceiver,
  exportBatch,
  fetchBatchRows,
  fetchBatches,
  fetchPreview,
  fetchReceivers,
  rotateKey,
  setReceiverActive,
} from './api';
import { downloadRows } from './format';

/** Hand-off of approved lines to the receiving system (FR-REQ-06, 07). Managers only. */
export function HandoffPanel({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['handoff-preview', orgId],
    queryFn: () => fetchPreview(orgId),
  });
  const batches = useQuery({
    queryKey: ['handoff-batches', orgId],
    queryFn: () => fetchBatches(orgId),
  });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = preview.data ?? [];
  const byCategory = rows.reduce<Record<string, number>>(
    (m, r) => ({ ...m, [r.category]: (m[r.category] ?? 0) + 1 }),
    {},
  );
  const requests = new Set(rows.map((r) => r.request_number)).size;
  const refresh = () =>
    Promise.all(
      ['handoff-preview', 'handoff-batches', 'ir-list'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    );

  const doExport = async (ext: 'csv' | 'xlsx') => {
    if (!window.confirm(t('handoff.confirm', { count: rows.length }))) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await exportBatch(orgId);
      if (!res.batch_id) setMessage({ kind: 'ok', text: t('handoff.nothing') });
      else {
        await downloadRows(res.rows, res.batch_id, ext);
        setMessage({
          kind: 'ok',
          text: t('handoff.exported', { count: res.rows.length, batch: res.batch_id.slice(0, 8) }),
        });
      }
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      await refresh();
    }
  };
  const again = async (batchId: string, ext: 'csv' | 'xlsx') => {
    try {
      await downloadRows(await fetchBatchRows(orgId, batchId), batchId, ext);
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="space-y-6 text-sm">
      <section aria-labelledby="ho-wait">
        <h2 id="ho-wait" className="font-semibold">
          {t('handoff.waiting')}
        </h2>
        <p className="mt-1" data-testid="handoff-summary">
          {t('handoff.summary', { lines: rows.length, requests })}
          {Object.entries(byCategory).length > 0 &&
            ` (${Object.entries(byCategory)
              .map(([c, n]) => `${t(`ir.cat.${c}`)} ${n}`)
              .join(', ')})`}
        </p>
        {rows.length > 0 && (
          <table className="mt-2 w-full">
            <thead className="text-gray-600">
              <tr>
                <th className="p-1 text-start">{t('ir.number')}</th>
                <th className="p-1 text-start">{t('ir.category')}</th>
                <th className="p-1 text-start">{t('ir.description')}</th>
                <th className="p-1 text-end">{t('ir.qty')}</th>
                <th className="p-1 text-start">{t('ir.externalCode')}</th>
                <th className="p-1 text-start">{t('ir.neededBy')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.request_number}-${r.line_no}`} className="border-t">
                  <td className="p-1 font-mono">
                    {r.request_number}/{r.line_no}
                  </td>
                  <td className="p-1">{t(`ir.cat.${r.category}`)}</td>
                  <td className="p-1">{r.description}</td>
                  <td className="p-1 text-end">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="p-1">{r.external_code ?? '-'}</td>
                  <td className="p-1">{r.needed_by ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => void doExport('xlsx')}
            className="rounded bg-green-800 px-3 py-1 text-white disabled:opacity-50"
          >
            {t('handoff.exportXlsx')}
          </button>
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => void doExport('csv')}
            className="rounded border px-3 py-1 disabled:opacity-50"
          >
            {t('handoff.exportCsv')}
          </button>
        </div>
        {message && (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`mt-2 ${message.kind === 'error' ? 'text-red-700' : 'text-green-900'}`}
          >
            {message.text}
          </p>
        )}
      </section>

      <section aria-labelledby="ho-batches">
        <h2 id="ho-batches" className="font-semibold">
          {t('handoff.batches')}
        </h2>
        {(batches.data ?? []).length === 0 && (
          <p className="text-gray-600">{t('handoff.noBatches')}</p>
        )}
        <ul className="mt-1 space-y-1" data-testid="handoff-batches">
          {(batches.data ?? []).map((b) => (
            <li key={b.batch_id} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{b.batch_id.slice(0, 8)}</span>
              <span>
                {new Date(b.sent_at).toLocaleString(i18n.language, { timeZone: 'Asia/Dubai' })}
              </span>
              <span>{b.channel}</span>
              <span>{t('handoff.batchCounts', { requests: b.requests, lines: b.lines })}</span>
              <button
                type="button"
                onClick={() => void again(b.batch_id, 'xlsx')}
                className="underline"
              >
                XLSX
              </button>
              <button
                type="button"
                onClick={() => void again(b.batch_id, 'csv')}
                className="underline"
              >
                CSV
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Receivers orgId={orgId} />
    </div>
  );
}

function Receivers({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['receivers', orgId], queryFn: () => fetchReceivers(orgId) });
  const [name, setName] = useState('');
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['receivers', orgId] });
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
    }
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      const r = await createReceiver(orgId, name.trim());
      setShown({ name: name.trim(), key: r.api_key });
      setName('');
    });
  };

  return (
    <section aria-labelledby="ho-rcv">
      <h2 id="ho-rcv" className="font-semibold">
        {t('handoff.receivers')}
      </h2>
      <p className="text-gray-600">{t('handoff.receiversHelp')}</p>
      {shown && (
        <div role="status" className="mt-2 rounded border border-amber-600 bg-amber-50 p-2">
          <p>{t('handoff.keyOnce', { name: shown.name })}</p>
          <code className="mt-1 block break-all select-all" data-testid="api-key" dir="ltr">
            {shown.key}
          </code>
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {(list.data ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className={r.active ? '' : 'text-gray-400 line-through'}>{r.name}</span>
            <span className="text-gray-600">{r.channel}</span>
            <button
              type="button"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm(t('handoff.rotateConfirm', { name: r.name }))) return;
                  setShown({ name: r.name, key: await rotateKey(r.id) });
                })
              }
              className="underline"
            >
              {t('handoff.rotate')}
            </button>
            <button
              type="button"
              onClick={() => void run(() => setReceiverActive(r.id, !r.active))}
              className="underline"
            >
              {r.active ? t('handoff.deactivate') : t('handoff.activate')}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex gap-2" aria-label={t('handoff.newReceiver')}>
        <input
          aria-label={t('handoff.receiverName')}
          placeholder={t('handoff.receiverName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border px-2 py-1"
        />
        <button type="submit" className="rounded border px-3 py-1">
          {t('handoff.newReceiver')}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
