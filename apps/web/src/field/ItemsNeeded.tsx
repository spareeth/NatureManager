import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchCatalogue, queueJobItems, type FieldJob, type ItemLine } from './api';

const BTN =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-lg font-semibold';
type Draft = Omit<ItemLine, 'id'>;
const UNITS = ['each', 'm', 'm2', 'm3', 'kg', 'L', 'bag'];

/** Items needed for the job (FR-REQ-04): picked from the catalogue kept on the phone, or typed;
 *  sent as one item request linked to the job and submitted for approval. Works offline. */
export function ItemsNeeded({ job, disabled }: { job: FieldJob; disabled: boolean }) {
  const { t } = useTranslation();
  const catalogue = useQuery({
    queryKey: ['field-items', job.organisation_id],
    queryFn: () => fetchCatalogue(job.organisation_id),
  });
  const items = catalogue.data?.data ?? [];
  const [lines, setLines] = useState<Draft[]>([]);
  const [itemId, setItemId] = useState('');
  const [text, setText] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('each');
  const [reason, setReason] = useState<Draft['reason']>('maintain');
  const [assetId, setAssetId] = useState(job.assets.length === 1 ? job.assets[0]!.id : '');
  const [sent, setSent] = useState(false);

  const pick = (id: string) => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) setUnit(it.unit);
  };
  const add = () => {
    const it = items.find((i) => i.id === itemId);
    const description = text.trim() || it?.name || '';
    const quantity = Number(qty);
    if (!description || !(quantity > 0)) return;
    setLines((l) => [
      ...l,
      { item_id: it?.id ?? null, description, quantity, unit, reason, asset_id: assetId || null },
    ]);
    setItemId('');
    setText('');
    setQty('1');
    setUnit('each');
    setSent(false);
  };
  const send = async () => {
    await queueJobItems(job, lines);
    setLines([]);
    setSent(true);
  };

  return (
    <section aria-labelledby="items-h" className="space-y-3 rounded-lg border-2 p-3">
      <h2 id="items-h" className="text-lg font-semibold">
        {t('fieldApp.itemsNeeded')}
      </h2>
      {(job.item_requests ?? []).map((r) => (
        <div key={r.id} className="rounded bg-gray-50 p-2" data-testid="job-item-request">
          <p className="font-semibold">
            {r.number || t('fieldApp.itemsQueued')} ·{' '}
            {r.status === 'queued'
              ? t('fieldApp.waitingToSend')
              : t(`ir.status.${r.status}`, r.status)}
          </p>
          <ul className="list-disc ps-5">
            {r.lines.map((l, k) => (
              <li key={k}>
                {l.quantity} {l.unit} {l.description} ({t(`ir.reasonName.${l.reason}`)})
              </li>
            ))}
          </ul>
        </div>
      ))}
      {sent && (
        <p role="status" className="text-green-900">
          {t('fieldApp.itemsSent')}
        </p>
      )}
      {!disabled && (
        <>
          <label className="block">
            {t('fieldApp.catalogueItem')}
            <select
              value={itemId}
              onChange={(e) => pick(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
            >
              <option value="">{t('ir.freeText')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            {t('ir.description')}
            <input
              value={text}
              placeholder={items.find((i) => i.id === itemId)?.name ?? ''}
              onChange={(e) => setText(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="w-24">
              {t('ir.qty')}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
              />
            </label>
            <label className="w-28">
              {t('ir.unit')}
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0 flex-1">
              {t('ir.reason')}
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as Draft['reason'])}
                className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
              >
                {(['maintain', 'replace', 'procure_new'] as const).map((r) => (
                  <option key={r} value={r}>
                    {t(`ir.reasonName.${r}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {job.assets.length > 0 && (
            <label className="block">
              {t('ir.asset')}
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
              >
                <option value="">-</option>
                {job.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag_code}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={add} className={`${BTN} w-full border-2`}>
            {t('fieldApp.addToList')}
          </button>
          {lines.length > 0 && (
            <>
              <ul className="space-y-1" aria-label={t('fieldApp.itemList')}>
                {lines.map((l, k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className="flex-1">
                      {l.quantity} {l.unit} {l.description} ({t(`ir.reasonName.${l.reason}`)})
                    </span>
                    <button
                      type="button"
                      aria-label={t('fieldApp.removeItem')}
                      onClick={() => setLines((x) => x.filter((_, i) => i !== k))}
                      className="min-h-12 min-w-12 rounded border-2"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void send()}
                className={`${BTN} w-full bg-green-800 text-white`}
              >
                {t('fieldApp.sendItems', { count: lines.length })}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
