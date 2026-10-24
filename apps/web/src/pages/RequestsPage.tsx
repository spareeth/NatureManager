import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import {
  CATEGORIES,
  createRequest,
  fetchItems,
  fetchRequests,
  fetchSiteLocations,
  generatePlantItems,
  IR_STATUSES,
  OPEN_STATUSES,
  saveItem,
  UNITS,
  type IrStatus,
  type Item,
} from '../requests/api';
import { IrStatusPill } from '../requests/IrStatusPill';
import { HandoffPanel } from '../handoff/HandoffPanel';

const WORKING = ['manager', 'field_manager', 'curator', 'green_team', 'field_engineer'];

/** Item requests (FR-REQ-02, 05) and the item catalogue (FR-REQ-01). */
export function RequestsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { current } = useOrg();
  const manager = !!current?.roles.includes('manager');
  const tabs = manager
    ? (['requests', 'catalogue', 'handoff'] as const)
    : (['requests', 'catalogue'] as const);
  const asked = params.get('tab');
  const tab = (tabs as readonly string[]).includes(asked ?? '')
    ? (asked as (typeof tabs)[number])
    : 'requests';
  const setTab = (v: string) =>
    setParams(
      (p) => {
        p.set('tab', v);
        return p;
      },
      { replace: true },
    );
  return (
    <section className="flex h-full flex-col overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('ir.heading')}</h1>
        <nav aria-label={t('ir.tabs')} className="flex gap-1 text-sm">
          {tabs.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={tab === v}
              onClick={() => setTab(v)}
              className={`rounded px-3 py-1 ${tab === v ? 'bg-green-800 text-white' : 'border'}`}
            >
              {t(`ir.tab.${v}`)}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-3">
        {tab === 'requests' ? (
          <RequestList />
        ) : tab === 'catalogue' ? (
          <Catalogue />
        ) : (
          current && <HandoffPanel orgId={current.organisationId} />
        )}
      </div>
    </section>
  );
}

function RequestList() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'open' | IrStatus | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const status = filter === 'open' ? OPEN_STATUSES : filter === 'all' ? undefined : [filter];
  const list = useQuery({
    queryKey: ['ir-list', site?.id, filter],
    enabled: !!site,
    queryFn: () => fetchRequests(site!.id, status),
  });
  const canRaise = !!current?.roles.some((r) => WORKING.includes(r));
  if (!current || !site) return <p>{t('common.loading')}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>
          {t('ir.show')}{' '}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded border px-2 py-1"
          >
            <option value="open">{t('ir.openOnly')}</option>
            <option value="all">{t('ir.all')}</option>
            {IR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`ir.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {canRaise && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ms-auto rounded bg-green-800 px-3 py-1 text-white"
          >
            {t('ir.new')}
          </button>
        )}
      </div>
      {creating && (
        <NewRequest
          orgId={current.organisationId}
          siteId={site.id}
          onCancel={() => setCreating(false)}
          onDone={(id) => navigate(`/requests/${id}`)}
        />
      )}
      {list.error && (
        <p role="alert" className="mt-2 text-red-700">
          {list.error.message}
        </p>
      )}
      {list.data && list.data.length === 0 && <p className="mt-3 text-gray-600">{t('ir.none')}</p>}
      {list.data && list.data.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="text-start text-gray-600">
            <tr>
              <th className="p-1 text-start">{t('ir.number')}</th>
              <th className="p-1 text-start">{t('ir.statusLabel')}</th>
              <th className="p-1 text-start">{t('ir.source')}</th>
              <th className="p-1 text-start">{t('ir.location')}</th>
              <th className="p-1 text-start">{t('ir.items')}</th>
              <th className="p-1 text-end">{t('ir.total')}</th>
              <th className="p-1 text-start">{t('ir.neededBy')}</th>
              <th className="p-1 text-start">{t('ir.requestedBy')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.id} className="border-t" data-testid={`ir-${r.number}`}>
                <td className="p-1">
                  <Link to={`/requests/${r.id}`} className="font-mono underline">
                    {r.number}
                  </Link>
                </td>
                <td className="p-1">
                  <IrStatusPill status={r.status} />
                </td>
                <td className="p-1">
                  {t(`ir.sourceName.${r.source}`)}
                  {r.work_order_number && ` (${r.work_order_number})`}
                </td>
                <td className="p-1">{r.location_code ?? '-'}</td>
                <td className="max-w-md truncate p-1" title={r.summary ?? ''}>
                  {r.summary ?? '-'}
                </td>
                <td className="p-1 text-end">
                  {r.total_aed ? `${r.total_aed.toFixed(2)} AED` : '-'}
                </td>
                <td className="p-1">{r.needed_by ?? '-'}</td>
                <td className="p-1">{r.requested_by_name ?? t('ir.system')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewRequest({
  orgId,
  siteId,
  onCancel,
  onDone,
}: {
  orgId: string;
  siteId: string;
  onCancel: () => void;
  onDone: (id: string) => void;
}) {
  const { t } = useTranslation();
  const locations = useQuery({
    queryKey: ['ir-locations', siteId],
    queryFn: () => fetchSiteLocations(siteId),
  });
  const [locationId, setLocationId] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await createRequest({
        orgId,
        siteId,
        locationId: locationId || null,
        neededBy: neededBy || null,
        notes: notes.trim() || null,
      });
      onDone(r.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form
      aria-label={t('ir.new')}
      onSubmit={submit}
      className="mt-3 max-w-lg space-y-2 rounded border p-3 text-sm"
    >
      <label className="block">
        {t('ir.location')}
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="mt-1 block w-full rounded border px-2 py-1"
        >
          <option value="">-</option>
          {(locations.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.code}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t('ir.neededBy')}
        <input
          type="date"
          value={neededBy}
          onChange={(e) => setNeededBy(e.target.value)}
          className="mt-1 block rounded border px-2 py-1"
        />
      </label>
      <label className="block">
        {t('ir.notes')}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded border px-2 py-1"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
          {t('ir.createDraft')}
        </button>
        <button type="button" onClick={onCancel} className="underline">
          {t('ir.cancel')}
        </button>
      </div>
    </form>
  );
}

function Catalogue() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const queryClient = useQueryClient();
  const orgId = current?.organisationId;
  const items = useQuery({
    queryKey: ['items', orgId],
    enabled: !!orgId,
    queryFn: () => fetchItems(orgId!),
  });
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const manager = !!current?.roles.includes('manager');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['items', orgId] });
  const shown = (items.data ?? []).filter((i) => !category || i.category === category);

  const generate = async () => {
    try {
      const n = await generatePlantItems(orgId!);
      setMessage({ kind: 'ok', text: t('ir.generated', { count: n }) });
      await refresh();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label>
          {t('ir.category')}{' '}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border px-2 py-1"
          >
            <option value="">{t('ir.all')}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`ir.cat.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-gray-600">{t('ir.itemCount', { count: shown.length })}</span>
        {manager && (
          <>
            <button
              type="button"
              onClick={() => setEditing({ category: 'other', unit: 'each', active: true })}
              className="ms-auto rounded bg-green-800 px-3 py-1 text-white"
            >
              {t('ir.newItem')}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              className="rounded border px-3 py-1"
            >
              {t('ir.generatePlants')}
            </button>
          </>
        )}
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 ${message.kind === 'error' ? 'text-red-700' : 'text-green-900'}`}
        >
          {message.text}
        </p>
      )}
      {editing && orgId && (
        <ItemForm
          key={editing.id ?? 'new'}
          item={editing}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            try {
              await saveItem(orgId, v);
              setEditing(null);
              setMessage({ kind: 'ok', text: t('ir.itemSaved') });
              await refresh();
            } catch (e) {
              setMessage({ kind: 'error', text: (e as Error).message });
            }
          }}
        />
      )}
      <table className="mt-3 w-full">
        <thead className="text-gray-600">
          <tr>
            <th className="p-1 text-start">{t('ir.code')}</th>
            <th className="p-1 text-start">{t('ir.name')}</th>
            <th className="p-1 text-start">{t('ir.category')}</th>
            <th className="p-1 text-start">{t('ir.unit')}</th>
            <th className="p-1 text-start">{t('ir.externalCode')}</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {shown.map((i) => (
            <tr key={i.id} className={`border-t ${i.active ? '' : 'text-gray-400'}`}>
              <td className="p-1 font-mono">{i.code}</td>
              <td className="p-1">{i.category === 'plant' ? <em>{i.name}</em> : i.name}</td>
              <td className="p-1">{t(`ir.cat.${i.category}`)}</td>
              <td className="p-1">{i.unit}</td>
              <td className="p-1">{i.external_code ?? '-'}</td>
              <td className="p-1 text-end">
                {manager && (
                  <button type="button" onClick={() => setEditing(i)} className="underline">
                    {t('ir.edit')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemForm({
  item,
  onSave,
  onCancel,
}: {
  item: Partial<Item>;
  onSave: (v: Omit<Item, 'id' | 'taxon_id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState({
    code: item.code ?? '',
    name: item.name ?? '',
    category: item.category ?? 'other',
    unit: item.unit ?? 'each',
    external_code: item.external_code ?? '',
    active: item.active ?? true,
  });
  return (
    <form
      aria-label={t('ir.itemForm')}
      className="mt-3 grid max-w-2xl grid-cols-2 gap-2 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ ...v, id: item.id, external_code: v.external_code.trim() || null });
      }}
    >
      <label>
        {t('ir.code')}
        <input
          required
          value={v.code}
          onChange={(e) => setV({ ...v, code: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label>
        {t('ir.name')}
        <input
          required
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label>
        {t('ir.category')}
        <select
          value={v.category}
          onChange={(e) => setV({ ...v, category: e.target.value as Item['category'] })}
          className="block w-full rounded border px-2 py-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`ir.cat.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('ir.unit')}
        <select
          value={v.unit}
          onChange={(e) => setV({ ...v, unit: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        >
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <label>
        {t('ir.externalCode')}
        <input
          value={v.external_code}
          onChange={(e) => setV({ ...v, external_code: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label className="flex items-center gap-2 self-end">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => setV({ ...v, active: e.target.checked })}
        />
        {t('ir.active')}
      </label>
      <div className="col-span-2 flex gap-3">
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
