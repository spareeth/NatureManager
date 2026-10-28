import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LeafletMap } from '../components/LeafletMap';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import {
  deleteControlPoint,
  listControlPoints,
  saveControlPoint,
  sitePoint,
  type ControlPoint,
  type System,
} from '../geo/api';
import { parseNumber } from '../geo/offset';

const SOURCES = ['rtk', 'total_station', 'cad', 'gcp_file'];
const REF_SOURCES = ['plan', 'cad', 'design', 'gcp_file'];
const m3 = (v: number | null | undefined) => (v == null ? '' : Number(v).toFixed(3));

type Draft = {
  id?: string;
  code: string;
  description: string;
  source: string;
  accuracy: string;
  surveyedAt: string;
  system: System;
  a: string;
  b: string;
  refX: string;
  refY: string;
  refSource: string;
};
const EMPTY: Draft = {
  code: '',
  description: '',
  source: 'rtk',
  accuracy: '',
  surveyedAt: '',
  system: 'dltm',
  a: '',
  b: '',
  refX: '',
  refY: '',
  refSource: 'plan',
};

/** Control points: register surveyed markers and check the site grid by residuals (FR-SITE-10). */
export function ControlPointsPage() {
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const queryClient = useQueryClient();
  const [map, setMap] = useState<L.Map | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const layer = useRef<L.LayerGroup | null>(null);
  const list = useQuery({
    queryKey: ['control-points', site?.id],
    enabled: !!site,
    queryFn: () => listControlPoints(site!.id),
  });

  const onReady = useCallback((m: L.Map | null) => {
    setMap(m);
    if (!m) return;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
  }, []);

  // Markers, and a click on the map fills the position while editing.
  useEffect(() => {
    const g = layer.current;
    if (!map || !g) return;
    g.clearLayers();
    for (const c of list.data?.rows ?? []) {
      const residual = c.residual_m != null ? ` (${m3(c.residual_m)} m)` : '';
      L.circleMarker([Number(c.lat), Number(c.lon)], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
      })
        .bindTooltip(`${c.code}${residual}`, {
          permanent: true,
          direction: 'right',
          className: 'bed-label',
        })
        .addTo(g);
    }
    const onClick = (e: L.LeafletMouseEvent) =>
      setDraft((d) =>
        d ? { ...d, system: 'wgs84', a: e.latlng.lng.toFixed(8), b: e.latlng.lat.toFixed(8) } : d,
      );
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, list.data]);

  const preview = useQuery({
    queryKey: ['site-point', site?.id, draft?.system, draft?.a, draft?.b],
    enabled: !!site && !!draft && parseNumber(draft.a) !== null && parseNumber(draft.b) !== null,
    queryFn: () =>
      sitePoint(site!.id, draft!.system, parseNumber(draft!.a)!, parseNumber(draft!.b)!),
  });

  function edit(c: ControlPoint) {
    setError(null);
    setDraft({
      id: c.id,
      code: c.code,
      description: c.description ?? '',
      source: c.source,
      accuracy: c.accuracy_m?.toString() ?? '',
      surveyedAt: c.surveyed_at ?? '',
      system: 'dltm',
      a: m3(c.e),
      b: m3(c.n),
      refX: c.ref_x?.toString() ?? '',
      refY: c.ref_y?.toString() ?? '',
      refSource: c.ref_source ?? 'plan',
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !site || !current) return;
    setError(null);
    const p = preview.data;
    const refX = parseNumber(draft.refX);
    const refY = parseNumber(draft.refY);
    const acc = parseNumber(draft.accuracy);
    if (!draft.code.trim()) return setError(t('cp.codeRequired'));
    if (!p) return setError(t('cp.positionRequired'));
    if ((refX === null) !== (refY === null)) return setError(t('cp.refBoth'));
    setSaving(true);
    try {
      await saveControlPoint(
        current.organisationId,
        site.id,
        {
          code: draft.code.trim().toUpperCase(),
          description: draft.description.trim() || null,
          source: draft.source,
          accuracy_m: acc,
          surveyed_at: draft.surveyedAt || null,
          ref_x: refX,
          ref_y: refY,
          ref_source: refX !== null ? draft.refSource : null,
          lon: Number(p.lon),
          lat: Number(p.lat),
        },
        draft.id,
      );
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['control-points'] });
    } catch (err) {
      const e2 = err as Error & { code?: string };
      setError(
        e2.code === '23505'
          ? t('cp.codeTaken')
          : e2.message === 'not_allowed'
            ? t('cp.notAllowed')
            : e2.message,
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: ControlPoint) {
    if (!window.confirm(t('cp.confirmDelete', { code: c.code }))) return;
    try {
      await deleteControlPoint(c.id);
      await queryClient.invalidateQueries({ queryKey: ['control-points'] });
    } catch (err) {
      setError(
        (err as Error).message === 'not_allowed' ? t('cp.notAllowed') : (err as Error).message,
      );
    }
  }

  const d = list.data;
  const input = 'w-full rounded border border-gray-300 px-2 py-1';
  const labels: Record<System, [string, string]> = {
    wgs84: [t('cp.lon'), t('cp.lat')],
    dltm: [t('cp.easting'), t('cp.northing')],
    grid: [t('cp.gridX'), t('cp.gridY')],
  };
  return (
    <section className="grid h-full gap-4 overflow-auto p-4 lg:grid-cols-[1fr_24rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold">{t('cp.heading')}</h1>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDraft({ ...EMPTY });
            }}
            className="ms-auto rounded bg-green-800 px-3 py-1 text-sm font-medium text-white"
          >
            {t('cp.add')}
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-600" data-testid="cp-summary">
          {d && d.rows.length > 0
            ? t('cp.summary', {
                count: d.rows.length,
                n: d.rows.length,
                ref: d.with_reference,
                rmse: m3(d.rmse_m) || '-',
                max: m3(d.max_m) || '-',
              })
            : t('cp.none')}
        </p>
        <div className="mt-2 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-gray-600">
                <th className="py-2 pe-3 text-start font-medium">{t('cp.code')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('cp.source')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('cp.grid')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('cp.dltm')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('cp.reference')}</th>
                <th className="py-2 pe-3 text-start font-medium">{t('cp.residual')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((c) => (
                <tr key={c.id} className="border-b align-top">
                  <td className="py-1.5 pe-3">
                    <span className="font-mono font-semibold" dir="ltr">
                      {c.code}
                    </span>
                    {c.description && <div className="text-xs text-gray-500">{c.description}</div>}
                  </td>
                  <td className="py-1.5 pe-3">
                    {t(`cp.sources.${c.source}`, { defaultValue: c.source })}
                    {c.accuracy_m != null && (
                      <span className="text-gray-500"> ±{c.accuracy_m} m</span>
                    )}
                  </td>
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                    {m3(c.x)}, {m3(c.y)}
                  </td>
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                    {m3(c.e)}, {m3(c.n)}
                  </td>
                  <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                    {c.ref_x != null ? `${m3(c.ref_x)}, ${m3(c.ref_y)}` : ''}
                  </td>
                  <td
                    className="py-1.5 pe-3 font-mono text-xs"
                    dir="ltr"
                    data-testid={`residual-${c.code}`}
                  >
                    {c.residual_m != null && (
                      <>
                        <strong>{m3(c.residual_m)} m</strong>
                        <div className="text-gray-500">
                          dx {m3(c.dx)}, dy {m3(c.dy)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-1.5 text-end whitespace-nowrap">
                    <button type="button" onClick={() => edit(c)} className="text-sm underline">
                      {t('edit.edit')}
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => void remove(c)}
                      className="text-sm text-red-700 underline"
                    >
                      {t('cp.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 h-80">
          <LeafletMap onReady={onReady} className="h-full w-full rounded border" />
        </div>
      </div>

      {draft && (
        <form
          onSubmit={submit}
          aria-label={draft.id ? t('cp.editTitle') : t('cp.newTitle')}
          className="space-y-2 rounded border p-3 text-sm"
        >
          <h2 className="font-semibold">{draft.id ? t('cp.editTitle') : t('cp.newTitle')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label>
              {t('cp.code')}
              <input
                dir="ltr"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                className={`${input} font-mono`}
              />
            </label>
            <label>
              {t('cp.source')}
              <select
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                className={input}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`cp.sources.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            {t('cp.description')}
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={input}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              {t('form.accuracy')}
              <input
                dir="ltr"
                inputMode="decimal"
                value={draft.accuracy}
                onChange={(e) => setDraft({ ...draft, accuracy: e.target.value })}
                className={input}
              />
            </label>
            <label>
              {t('cp.surveyedAt')}
              <input
                type="date"
                value={draft.surveyedAt}
                onChange={(e) => setDraft({ ...draft, surveyedAt: e.target.value })}
                className={input}
              />
            </label>
          </div>
          <fieldset>
            <legend>{t('cp.position')}</legend>
            <select
              aria-label={t('cp.system')}
              value={draft.system}
              onChange={(e) =>
                setDraft({ ...draft, system: e.target.value as System, a: '', b: '' })
              }
              className={`${input} mt-1`}
            >
              <option value="dltm">{t('cp.systems.dltm')}</option>
              <option value="wgs84">{t('cp.systems.wgs84')}</option>
              <option value="grid">{t('cp.systems.grid')}</option>
            </select>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label>
                {labels[draft.system][0]}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.a}
                  onChange={(e) => setDraft({ ...draft, a: e.target.value })}
                  className={input}
                />
              </label>
              <label>
                {labels[draft.system][1]}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.b}
                  onChange={(e) => setDraft({ ...draft, b: e.target.value })}
                  className={input}
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('cp.clickHint')}</p>
            {preview.data && (
              <p
                className="mt-1 rounded bg-gray-50 px-2 py-1 font-mono text-xs"
                dir="ltr"
                data-testid="cp-preview"
              >
                x {m3(preview.data.x)}, y {m3(preview.data.y)} | E {m3(preview.data.e)}, N{' '}
                {m3(preview.data.n)}
                <br />
                {Number(preview.data.lat).toLocaleString(i18n.language, {
                  maximumFractionDigits: 7,
                })}
                ,{' '}
                {Number(preview.data.lon).toLocaleString(i18n.language, {
                  maximumFractionDigits: 7,
                })}
              </p>
            )}
          </fieldset>
          <fieldset>
            <legend>{t('cp.referenceTitle')}</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <label>
                {t('cp.gridX')}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.refX}
                  onChange={(e) => setDraft({ ...draft, refX: e.target.value })}
                  className={input}
                />
              </label>
              <label>
                {t('cp.gridY')}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={draft.refY}
                  onChange={(e) => setDraft({ ...draft, refY: e.target.value })}
                  className={input}
                />
              </label>
              <label>
                {t('cp.refSource')}
                <select
                  value={draft.refSource}
                  onChange={(e) => setDraft({ ...draft, refSource: e.target.value })}
                  className={input}
                >
                  {REF_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`cp.refSources.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="rounded bg-red-50 px-2 py-1 text-red-800">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-green-800 px-4 py-1.5 font-medium text-white disabled:opacity-60"
            >
              {saving ? t('form.saving') : t('form.save')}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="underline">
              {t('form.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
