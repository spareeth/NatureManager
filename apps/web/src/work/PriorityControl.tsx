import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { setPriority } from './api';

/** Change a work order's priority (managers and field managers), with a reason for the history. */
export function PriorityControl({
  woId,
  current,
  onDone,
}: {
  woId: string;
  current: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [priority, setP] = useState(current);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-green-800 px-3 py-1 text-sm text-green-900"
      >
        {t('wo.changePriority')}
      </button>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError(t('wo.priorityReasonRequired'));
    setBusy(true);
    setError(null);
    try {
      await setPriority(woId, priority, reason.trim());
      setOpen(false);
      setReason('');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      aria-label={t('wo.changePriority')}
      className="flex w-full max-w-xl flex-wrap items-end gap-2 rounded border p-3 text-sm"
    >
      <label>
        {t('wo.urgency')}
        <select
          value={priority}
          onChange={(e) => setP(e.target.value)}
          className="block rounded border px-2 py-1"
        >
          {['P1', 'P2', 'P3', 'P4'].map((p) => (
            <option key={p} value={p}>
              {t(`wo.priority.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-48 flex-1">
        {t('wo.priorityReason')}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={busy || priority === current}
        className="rounded bg-green-800 px-3 py-1 text-white disabled:opacity-50"
      >
        {t('wo.savePriority')}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="underline">
        {t('form.cancel')}
      </button>
      {error && (
        <p role="alert" className="w-full text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
