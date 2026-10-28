import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { A4_24, pageCountFor, perPage } from './layout';
import { buildLabelPdf } from './pdf';
import { fetchLabels } from './api';

type Props = {
  /** Asset ids to print, or a function that collects them (for a whole filtered list). */
  ids: string[] | (() => Promise<string[]>);
  count: number;
  onClose: () => void;
};

/** Choose the first free label on the sheet, then download the A4 PDF (FR-AST-06). */
export function LabelDialog({ ids, count, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [startAt, setStartAt] = useState(1);
  const [outlines, setOutlines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = perPage(A4_24);
  const nf = (x: number) => x.toLocaleString(i18n.language);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const list = typeof ids === 'function' ? await ids() : ids;
      const labels = await fetchLabels(list);
      const doc = await buildLabelPdf(labels, { startAt, outlines });
      doc.save(`terra-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="label-dialog-title"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 p-4"
    >
      <div className="w-full max-w-sm rounded bg-white p-4 shadow-lg">
        <h2 id="label-dialog-title" className="font-semibold">
          {t('labels.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {t('labels.summary', {
            labels: nf(count),
            pages: nf(pageCountFor(count, startAt)),
            count,
          })}
        </p>
        <label className="mt-3 block text-sm">
          {t('labels.startAt', { n })}
          <select
            value={startAt}
            onChange={(e) => setStartAt(Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          >
            {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>
                {t('labels.position', { n: i, row: Math.ceil(i / 3), col: ((i - 1) % 3) + 1 })}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outlines}
            onChange={(e) => setOutlines(e.target.checked)}
          />
          {t('labels.outlines')}
        </label>
        <p className="mt-2 text-xs text-gray-500">{t('labels.note')}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            disabled={busy || count === 0}
            onClick={() => void generate()}
            className="rounded bg-green-800 px-4 py-1.5 font-medium text-white disabled:opacity-60"
          >
            {busy ? t('labels.working') : t('labels.download')}
          </button>
          <button type="button" onClick={onClose} className="px-2 py-1.5 underline">
            {t('form.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
