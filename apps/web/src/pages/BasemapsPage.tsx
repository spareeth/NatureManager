import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import {
  deleteBasemap,
  fetchBasemaps,
  KEYS,
  saveBasemap,
  setDefaultBasemap,
  type Basemap,
  type BasemapInput,
} from '../map/basemaps';

/** Base maps of the site (site_basemap): which layers the map offers, the default, and which may be
 *  stored on phones for offline use. Managers edit; Google and Esri are online only. */
export function BasemapsPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['basemaps', site?.id],
    enabled: !!site,
    queryFn: () => fetchBasemaps(site!.id),
  });
  const [editing, setEditing] = useState<Partial<Basemap> | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  if (!current || !site) return <p className="p-4">{t('common.loading')}</p>;
  const rows = list.data ?? [];

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: 'ok', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['basemaps'] });
    }
  };
  const move = (b: Basemap, dir: -1 | 1) => {
    const i = rows.findIndex((x) => x.id === b.id);
    const other = rows[i + dir];
    if (!other) return;
    void act(async () => {
      await saveBasemap(current.organisationId, site.id, { ...b, sort_order: other.sort_order });
      await saveBasemap(current.organisationId, site.id, {
        ...other,
        sort_order: b.sort_order === other.sort_order ? b.sort_order + dir : b.sort_order,
      });
    }, t('basemaps.saved'));
  };
  const keyMissing = (b: Basemap) =>
    (b.kind === 'google' && !KEYS.google) || (b.kind === 'esri' && !KEYS.esri);

  return (
    <section className="h-full overflow-y-auto p-4 text-sm">
      <h1 className="text-xl font-semibold">{t('basemaps.heading')}</h1>
      <p className="mt-1 max-w-3xl text-gray-700">{t('basemaps.help')}</p>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 ${message.kind === 'error' ? 'text-red-700' : 'text-green-900'}`}
        >
          {message.text}
        </p>
      )}
      <table className="mt-3 w-full max-w-5xl">
        <thead className="text-gray-600">
          <tr>
            <th className="p-1 text-start">{t('basemaps.name')}</th>
            <th className="p-1 text-start">{t('basemaps.kind')}</th>
            <th className="p-1 text-start">{t('basemaps.zoom')}</th>
            <th className="p-1 text-start">{t('basemaps.offline')}</th>
            <th className="p-1 text-start">{t('basemaps.default')}</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr
              key={b.id}
              className={`border-t ${b.active ? '' : 'text-gray-400'}`}
              data-testid={`basemap-${b.name}`}
            >
              <td className="p-1">
                {t(`map.layers.named.${b.name}`, { defaultValue: b.name })}
                {keyMissing(b) && (
                  <span className="ms-2 text-amber-800">{t('basemaps.noKey')}</span>
                )}
                {!b.active && <span className="ms-2">({t('basemaps.inactive')})</span>}
              </td>
              <td className="p-1">{t(`basemaps.kindName.${b.kind}`)}</td>
              <td className="p-1">
                {b.min_zoom} to {b.max_zoom} ({t('basemaps.native', { z: b.max_native_zoom })})
              </td>
              <td className="p-1">
                {b.offline_allowed ? t('basemaps.yes') : t('basemaps.onlineOnly')}
              </td>
              <td className="p-1">
                {b.is_default ? (
                  <strong>{t('basemaps.isDefault')}</strong>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void act(() => setDefaultBasemap(b.id), t('basemaps.defaultSet'))
                    }
                    className="underline"
                  >
                    {t('basemaps.makeDefault')}
                  </button>
                )}
              </td>
              <td className="p-1 text-end whitespace-nowrap">
                <button
                  type="button"
                  aria-label={t('basemaps.up')}
                  disabled={i === 0}
                  onClick={() => move(b, -1)}
                  className="px-1 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={t('basemaps.down')}
                  disabled={i === rows.length - 1}
                  onClick={() => move(b, 1)}
                  className="px-1 disabled:opacity-30"
                >
                  ▼
                </button>{' '}
                <button type="button" onClick={() => setEditing(b)} className="underline">
                  {t('basemaps.edit')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!editing && (
        <button
          type="button"
          onClick={() =>
            setEditing({
              kind: 'xyz',
              min_zoom: 0,
              max_zoom: 22,
              max_native_zoom: 20,
              offline_allowed: true,
              active: true,
              sort_order: 5,
            })
          }
          className="mt-3 rounded bg-green-800 px-3 py-1 text-white"
        >
          {t('basemaps.add')}
        </button>
      )}
      {editing && (
        <BasemapForm
          key={editing.id ?? 'new'}
          value={editing}
          onCancel={() => setEditing(null)}
          onDelete={
            editing.id
              ? () => {
                  if (!window.confirm(t('basemaps.deleteConfirm'))) return;
                  void act(() => deleteBasemap(editing.id!), t('basemaps.deleted')).then(() =>
                    setEditing(null),
                  );
                }
              : undefined
          }
          onSave={(v) =>
            void act(
              () => saveBasemap(current.organisationId, site.id, v),
              t('basemaps.saved'),
            ).then(() => setEditing(null))
          }
        />
      )}
    </section>
  );
}

function BasemapForm({
  value,
  onSave,
  onCancel,
  onDelete,
}: {
  value: Partial<Basemap>;
  onSave: (v: BasemapInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState({
    name: value.name ?? '',
    kind: value.kind ?? 'xyz',
    url: value.url ?? '',
    attribution: value.attribution ?? '',
    min_zoom: value.min_zoom ?? 0,
    max_zoom: value.max_zoom ?? 22,
    max_native_zoom: value.max_native_zoom ?? 20,
    offline_allowed: value.offline_allowed ?? false,
    active: value.active ?? true,
    sort_order: value.sort_order ?? 100,
  });
  const xyz = v.kind === 'xyz';
  const urlOk =
    !xyz || (/^https?:\/\//.test(v.url) && ['{z}', '{x}', '{y}'].every((p) => v.url.includes(p)));
  return (
    <form
      aria-label={t('basemaps.form')}
      className="mt-3 grid max-w-3xl grid-cols-2 gap-2 rounded border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!urlOk) return;
        onSave({
          ...v,
          id: value.id,
          kind: v.kind as Basemap['kind'],
          url: xyz ? v.url.trim() : null,
          attribution: v.attribution.trim() || null,
          offline_allowed: xyz && v.offline_allowed,
        });
      }}
    >
      <label>
        {t('basemaps.name')}
        <input
          required
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <label>
        {t('basemaps.kind')}
        <select
          value={v.kind}
          onChange={(e) => setV({ ...v, kind: e.target.value as Basemap['kind'] })}
          className="block w-full rounded border px-2 py-1"
        >
          {(['xyz', 'google', 'esri'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`basemaps.kindName.${k}`)}
            </option>
          ))}
        </select>
      </label>
      {xyz && (
        <label className="col-span-2">
          {t('basemaps.url')}
          <input
            required
            dir="ltr"
            value={v.url}
            placeholder="https://tiles.example.org/terra/{z}/{x}/{y}.webp"
            onChange={(e) => setV({ ...v, url: e.target.value })}
            className="block w-full rounded border px-2 py-1 font-mono"
          />
        </label>
      )}
      {xyz && !urlOk && v.url && (
        <p role="alert" className="col-span-2 text-red-700">
          {t('basemaps.urlHelp')}
        </p>
      )}
      <label className="col-span-2">
        {t('basemaps.attribution')}
        <input
          value={v.attribution}
          onChange={(e) => setV({ ...v, attribution: e.target.value })}
          className="block w-full rounded border px-2 py-1"
        />
      </label>
      <div className="col-span-2 flex flex-wrap gap-3">
        {(['min_zoom', 'max_zoom', 'max_native_zoom'] as const).map((k) => (
          <label key={k} className="w-32">
            {t(`basemaps.${k}`)}
            <input
              type="number"
              min={0}
              max={24}
              value={v[k]}
              onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
              className="block w-full rounded border px-2 py-1"
            />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={!xyz}
          checked={xyz && v.offline_allowed}
          onChange={(e) => setV({ ...v, offline_allowed: e.target.checked })}
        />
        {t('basemaps.offlineAllowed')}
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => setV({ ...v, active: e.target.checked })}
        />
        {t('basemaps.active')}
      </label>
      {!xyz && <p className="col-span-2 text-gray-700">{t('basemaps.keyNote')}</p>}
      {xyz && v.offline_allowed && (
        <p className="col-span-2 text-gray-700">{t('basemaps.offlineNote')}</p>
      )}
      <div className="col-span-2 flex gap-3">
        <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
          {t('basemaps.save')}
        </button>
        <button type="button" onClick={onCancel} className="underline">
          {t('basemaps.cancel')}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ms-auto text-red-700 underline">
            {t('basemaps.delete')}
          </button>
        )}
      </div>
    </form>
  );
}
