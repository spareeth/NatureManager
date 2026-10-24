import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import {
  assetIdByTag,
  deleteLine,
  deleteRequest,
  fetchIrAllowed,
  fetchItems,
  fetchRequest,
  irTransition,
  lineTotal,
  REASONS,
  saveLine,
  UNITS,
  type IrLine,
  type IrStatus,
  type Item,
  type LineInput,
} from '../requests/api';
import { IrStatusPill } from '../requests/IrStatusPill';

/** One item request: lines (editable while a draft) and its lifecycle (FR-REQ-02, 05). */
export function RequestDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const req = useQuery({ queryKey: ['ir', id], queryFn: () => fetchRequest(id!) });
  const allowed = useQuery({ queryKey: ['ir-allowed', id], queryFn: () => fetchIrAllowed(id!) });
  const items = useQuery({
    queryKey: ['items', current?.organisationId],
    enabled: !!current,
    queryFn: () => fetchItems(current!.organisationId),
  });
  const [editing, setEditing] = useState<Partial<IrLine> | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ir', id] }),
      queryClient.invalidateQueries({ queryKey: ['ir-allowed', id] }),
      queryClient.invalidateQueries({ queryKey: ['ir-list'] }),
    ]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ kind: 'ok', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      await refresh();
    }
  };

  if (req.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (req.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {req.error.message}
      </p>
    );
  const r = req.data;
  if (!r) return <p className="p-4">{t('ir.notFound')}</p>;
  const roles = current?.roles ?? [];
  const planner = roles.includes('manager') || roles.includes('field_manager');
  const editable =
    r.status === 'draft' && (planner || allowed.data?.some((a) => a.to_status === 'submitted'));

  const move = (to: IrStatus, noteRequired: boolean) => {
    let note: string | undefined;
    if (noteRequired || to === 'cancelled') {
      note = window.prompt(t('ir.reasonPrompt')) ?? undefined;
      if (noteRequired && !note) return;
    }
    void act(() => irTransition(r.id, to, note), t('ir.moved', { status: t(`ir.status.${to}`) }));
  };

  return (
    <section className="h-full space-y-4 overflow-y-auto p-4 text-sm">
      <Link to="/requests" className="underline">
        ‹ {t('ir.heading')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold">{r.number}</h1>
        <IrStatusPill status={r.status} />
        <span>{t(`ir.sourceName.${r.source}`)}</span>
        {r.work_order_id && (
          <Link to={`/work/${r.work_order_id}`} className="underline">
            {r.work_order_number}
          </Link>
        )}
      </header>
      <dl className="grid max-w-2xl grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-gray-600">{t('ir.location')}</dt>
        <dd>{r.location_code ?? '-'}</dd>
        <dt className="text-gray-600">{t('ir.neededBy')}</dt>
        <dd>{r.needed_by ?? '-'}</dd>
        <dt className="text-gray-600">{t('ir.requestedBy')}</dt>
        <dd>{r.requested_by_name ?? t('ir.system')}</dd>
        {r.approved_by_name && (
          <>
            <dt className="text-gray-600">{t('ir.approvedBy')}</dt>
            <dd>
              {r.approved_by_name},{' '}
              {new Date(r.approved_at!).toLocaleString(i18n.language, { timeZone: 'Asia/Dubai' })}
            </dd>
          </>
        )}
        {r.external_ref && (
          <>
            <dt className="text-gray-600">{t('ir.externalRef')}</dt>
            <dd>{r.external_ref}</dd>
          </>
        )}
        <dt className="text-gray-600">{t('ir.notes')}</dt>
        <dd className="whitespace-pre-line">{r.notes ?? '-'}</dd>
      </dl>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded px-2 py-1 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}
        >
          {message.text}
        </p>
      )}

      <section aria-labelledby="ir-lines">
        <h2 id="ir-lines" className="font-semibold">
          {t('ir.lines')}
        </h2>
        <table className="mt-1 w-full" data-testid="ir-lines">
          <thead className="text-gray-600">
            <tr>
              <th className="p-1 text-start">#</th>
              <th className="p-1 text-start">{t('ir.item')}</th>
              <th className="p-1 text-start">{t('ir.description')}</th>
              <th className="p-1 text-start">{t('ir.reason')}</th>
              <th className="p-1 text-end">{t('ir.qty')}</th>
              <th className="p-1 text-end">{t('ir.unitCost')}</th>
              <th className="p-1 text-start">{t('ir.asset')}</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-1">{l.line_no}</td>
                <td className="p-1 font-mono">{l.item_code ?? '-'}</td>
                <td className="p-1">{l.description}</td>
                <td className="p-1">{t(`ir.reasonName.${l.reason}`)}</td>
                <td className="p-1 text-end">
                  {l.quantity} {l.unit}
                </td>
                <td className="p-1 text-end">
                  {l.est_unit_cost != null ? l.est_unit_cost.toFixed(2) : '-'}
                </td>
                <td className="p-1 font-mono">{l.asset_tag ?? '-'}</td>
                <td className="p-1 text-end">
                  {editable && (
                    <>
                      <button type="button" onClick={() => setEditing(l)} className="underline">
                        {t('ir.edit')}
                      </button>{' '}
                      <button
                        type="button"
                        onClick={() => void act(() => deleteLine(l.id))}
                        className="text-red-700 underline"
                      >
                        {t('ir.remove')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="p-1" colSpan={5}>
                {t('ir.total')}
              </td>
              <td className="p-1 text-end" data-testid="ir-total">
                {lineTotal(r.lines).toFixed(2)} AED
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing({ reason: 'maintain', unit: 'each', quantity: 1 })}
            className="mt-2 rounded border px-3 py-1"
          >
            {t('ir.addLine')}
          </button>
        )}
        {editing && current && (
          <LineForm
            key={editing.id ?? 'new'}
            line={editing}
            items={items.data ?? []}
            onCancel={() => setEditing(null)}
            onSave={async (v, tag) => {
              const asset_id = tag ? await assetIdByTag(current.organisationId, tag) : null;
              if (tag && !asset_id) throw new Error(t('ir.unknownTag', { tag }));
              await saveLine(r, { ...v, asset_id });
              setEditing(null);
              await refresh();
            }}
          />
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {(allowed.data ?? []).map((a) => (
          <button
            key={a.to_status}
            type="button"
            onClick={() => move(a.to_status, a.note_required)}
            className={`rounded px-3 py-1 ${a.to_status === 'rejected' || a.to_status === 'cancelled' ? 'border border-red-700 text-red-800' : 'bg-green-800 text-white'}`}
          >
            {t(`ir.action.${a.to_status}`)}
          </button>
        ))}
        {r.status === 'draft' && editable && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('ir.deleteConfirm')))
                void deleteRequest(r.id).then(
                  () => navigate('/requests'),
                  (e: Error) => setMessage({ kind: 'error', text: e.message }),
                );
            }}
            className="rounded border px-3 py-1 text-red-800"
          >
            {t('ir.deleteDraft')}
          </button>
        )}
      </div>

      <section aria-labelledby="ir-history">
        <h2 id="ir-history" className="font-semibold">
          {t('ir.history')}
        </h2>
        <ol className="mt-1 space-y-1" data-testid="ir-history">
          {r.events.map((e, k) => (
            <li key={k}>
              {new Date(e.at).toLocaleString(i18n.language, { timeZone: 'Asia/Dubai' })}:{' '}
              {e.from ? `${t(`ir.status.${e.from}`)} → ` : ''}
              {t(`ir.status.${e.to}`)} ({e.by ?? e.system ?? t('ir.system')})
              {e.note && `: ${e.note}`}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function LineForm({
  line,
  items,
  onSave,
  onCancel,
}: {
  line: Partial<IrLine>;
  items: Item[];
  onSave: (v: LineInput, assetTag: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [itemId, setItemId] = useState(line.item_id ?? '');
  const [description, setDescription] = useState(line.description ?? '');
  const [reason, setReason] = useState<IrLine['reason']>(line.reason ?? 'maintain');
  const [quantity, setQuantity] = useState(String(line.quantity ?? 1));
  const [unit, setUnit] = useState(line.unit ?? 'each');
  const [cost, setCost] = useState(line.est_unit_cost != null ? String(line.est_unit_cost) : '');
  const [tag, setTag] = useState(line.asset_tag ?? '');
  const [error, setError] = useState<string | null>(null);
  const active = items.filter((i) => i.active || i.id === itemId);
  const pick = (id: string) => {
    setItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) {
      setUnit(it.unit);
      if (!description) setDescription(it.name);
    }
  };
  return (
    <form
      aria-label={t('ir.lineForm')}
      className="mt-2 grid max-w-3xl grid-cols-2 gap-2 rounded border p-3 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        void onSave(
          {
            id: line.id,
            item_id: itemId || null,
            description: description.trim(),
            reason,
            quantity: Number(quantity),
            unit,
            est_unit_cost: cost === '' ? null : Number(cost),
            asset_id: null,
          },
          tag.trim(),
        ).catch((err: Error) => setError(err.message));
      }}
    >
      <label className="col-span-2">
        {t('ir.item')}
        <select
          value={itemId}
          onChange={(e) => pick(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        >
          <option value="">{t('ir.freeText')}</option>
          {active.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code}: {i.name}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-2">
        {t('ir.description')}
        <input
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label>
        {t('ir.reason')}
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as IrLine['reason'])}
          className="block w-full rounded border px-2 py-1"
        >
          {REASONS.map((x) => (
            <option key={x} value={x}>
              {t(`ir.reasonName.${x}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ir.qty')}
        <input
          required
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label>
        {t('ir.unit')}
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        >
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <label>
        {t('ir.unitCost')}
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label className="col-span-2">
        {t('ir.assetTag')}
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          dir="ltr"
          className="block w-full rounded border px-2 py-1 font-mono"
        />
      </label>
      {error && (
        <p role="alert" className="col-span-full text-red-700">
          {error}
        </p>
      )}
      <div className="col-span-full flex gap-3">
        <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
          {t('ir.save')}
        </button>
        <button type="button" onClick={onCancel} className="underline">
          {t('ir.cancel')}
        </button>
      </div>
    </form>
  );
}
