import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { raiseRequest } from './api';

type RequestInput = Parameters<typeof raiseRequest>[0];

type Props = {
  orgId: string;
  siteId: string;
  asset?: { id: string; tag_code: string; location_id?: string | null; lon?: number; lat?: number };
  onDone: (wo: { id: string; number: string }) => void;
  onCancel: () => void;
  /** How to send it; the field app queues it in the offline outbox. Default: insert now. */
  submit?: (v: RequestInput) => Promise<{ id: string; number: string }>;
};

/** Report a problem: any member raises a request (FR-WO-06). */
export function RequestForm({
  orgId,
  siteId,
  asset,
  onDone,
  onCancel,
  submit: send = raiseRequest,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('wo.titleRequired'));
    setError(null);
    setBusy(true);
    try {
      const wo = await send({
        orgId,
        siteId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assetId: asset?.id ?? null,
        locationId: asset?.location_id ?? null,
        geom:
          asset?.lon != null && asset.lat != null
            ? `SRID=4326;POINT(${asset.lon} ${asset.lat})`
            : null,
      });
      onDone(wo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // 48 px on phones for the field app (FR-FLD-06).
  const input = 'w-full rounded border border-gray-300 px-2 py-1 min-h-12 sm:min-h-0';
  return (
    <form
      onSubmit={submit}
      aria-label={t('wo.reportTitle')}
      className="space-y-2 rounded border p-3 text-sm"
    >
      <h2 className="font-semibold">
        {t('wo.reportTitle')}
        {asset && (
          <span className="ms-2 font-mono font-normal" dir="ltr">
            {asset.tag_code}
          </span>
        )}
      </h2>
      <label className="block">
        {t('wo.whatIsWrong')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      <label className="block">
        {t('wo.details')}
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={input}
        />
      </label>
      <label className="block">
        {t('wo.urgency')}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={input}>
          {['P1', 'P2', 'P3', 'P4'].map((p) => (
            <option key={p} value={p}>
              {t(`wo.priority.${p}`)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded bg-green-800 px-3 py-1 font-medium text-white disabled:opacity-60 sm:min-h-0"
        >
          {t('wo.send')}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 underline sm:min-h-0">
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
