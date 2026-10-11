import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listControlPoints, nearestCorner, sitePoint, type SitePoint } from './api';
import { fromDistanceBearing, parseNumber, type Offset } from './offset';
import { formatGrid, formatLatLon } from '../map/format';

export type OffsetOrigin = {
  label: string;
  x: number;
  y: number;
  lon: number;
  lat: number;
  accuracy: number | null;
};

type Props = {
  map: L.Map | null;
  siteId: string;
  /**
   * 'origin': place from a control point or bed corner (FR-SITE-11), result is a point.
   * 'shift': move an existing asset by dx, dy from where it is (start = the asset).
   */
  mode: 'origin' | 'shift';
  start?: OffsetOrigin;
  title: string;
  onUse: (r: {
    target: SitePoint;
    offset: Offset;
    origin: OffsetOrigin;
    accuracy: number | null;
  }) => void;
  onCancel: () => void;
  busy?: boolean;
};

/** Offset entry with a live preview on the map. Grid arithmetic here; transforms in the database. */
export function OffsetPanel({ map, siteId, mode, start, title, onUse, onCancel, busy }: Props) {
  const { t } = useTranslation();
  const [originKind, setOriginKind] = useState<'control' | 'corner'>('control');
  const [controlId, setControlId] = useState('');
  const [corner, setCorner] = useState<OffsetOrigin | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [inputKind, setInputKind] = useState<'dxdy' | 'bearing'>('dxdy');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const layer = useRef<L.LayerGroup | null>(null);

  const controls = useQuery({
    queryKey: ['control-points', siteId],
    enabled: mode === 'origin',
    queryFn: () => listControlPoints(siteId),
  });

  const cp = controls.data?.rows.find((c) => c.id === controlId);
  const origin = useMemo<OffsetOrigin | null>(
    () =>
      mode === 'shift'
        ? (start ?? null)
        : originKind === 'control'
          ? cp
            ? {
                label: cp.code,
                x: Number(cp.x),
                y: Number(cp.y),
                lon: Number(cp.lon),
                lat: Number(cp.lat),
                accuracy: cp.accuracy_m,
              }
            : null
          : corner,
    [mode, start, originKind, cp, corner],
  );

  const na = parseNumber(a);
  const nb = parseNumber(b);
  const offset = useMemo<Offset | null>(
    () =>
      na === null || nb === null || (inputKind === 'bearing' && na < 0)
        ? null
        : inputKind === 'dxdy'
          ? { dx: na, dy: nb }
          : fromDistanceBearing(na, nb),
    [na, nb, inputKind],
  );

  const target = useQuery({
    queryKey: ['offset-target', siteId, origin?.x, origin?.y, offset?.dx, offset?.dy],
    enabled: !!origin && !!offset,
    queryFn: () => sitePoint(siteId, 'grid', origin!.x + offset!.dx, origin!.y + offset!.dy),
  });

  // Corner picking: next map click snaps to the nearest bed corner within 3 m.
  useEffect(() => {
    if (!map || !picking) return;
    const container = map.getContainer();
    container.style.cursor = 'crosshair';
    const onClick = async (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.leaflet-control, .leaflet-popup')) return;
      const p = map.mouseEventToLatLng(e);
      setPicking(false);
      const c = await nearestCorner(siteId, p.lng, p.lat, 3);
      if (!c) return setPickError(t('offset.noCorner'));
      setPickError(null);
      setCorner({
        label: `${c.code} #${c.vertex}`,
        x: Number(c.x),
        y: Number(c.y),
        lon: Number(c.lon),
        lat: Number(c.lat),
        accuracy: null,
      });
    };
    container.addEventListener('click', onClick);
    return () => {
      container.removeEventListener('click', onClick);
      container.style.cursor = '';
    };
  }, [map, picking, siteId, t]);

  // Preview: origin marker, dashed line, target marker.
  useEffect(() => {
    if (!map) return;
    const g = L.layerGroup().addTo(map);
    layer.current = g;
    return () => {
      g.remove();
      layer.current = null;
    };
  }, [map]);
  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    if (origin) {
      L.circleMarker([origin.lat, origin.lon], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
    }
    const tp = target.data;
    if (origin && tp && offset) {
      L.polyline(
        [
          [origin.lat, origin.lon],
          [tp.lat, tp.lon],
        ],
        { color: '#2563eb', dashArray: '4 4', interactive: false },
      ).addTo(g);
      L.circleMarker([tp.lat, tp.lon], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#166534',
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
    }
  }, [origin, target.data, offset]);

  const input = 'w-full rounded border border-gray-300 px-2 py-1';
  return (
    <div className="space-y-2 text-sm" aria-label={title} role="group">
      <h2 className="font-semibold">{title}</h2>
      {mode === 'origin' && (
        <fieldset>
          <legend className="text-gray-700">{t('offset.from')}</legend>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="origin"
                checked={originKind === 'control'}
                onChange={() => setOriginKind('control')}
              />
              {t('offset.controlPoint')}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="origin"
                checked={originKind === 'corner'}
                onChange={() => setOriginKind('corner')}
              />
              {t('offset.bedCorner')}
            </label>
          </div>
          {originKind === 'control' ? (
            <select
              aria-label={t('offset.controlPoint')}
              value={controlId}
              onChange={(e) => setControlId(e.target.value)}
              className={`${input} mt-1`}
            >
              <option value="">
                {controls.data?.rows.length === 0 ? t('offset.noControls') : ''}
              </option>
              {(controls.data?.rows ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.description ? ` · ${c.description}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="rounded border border-green-800 px-2 py-1 text-green-900"
              >
                {picking ? t('offset.clickCorner') : t('offset.pickCorner')}
              </button>
              {corner && (
                <span className="font-mono text-xs" dir="ltr">
                  {corner.label}
                </span>
              )}
            </div>
          )}
          {pickError && (
            <p role="alert" className="text-xs text-red-700">
              {pickError}
            </p>
          )}
        </fieldset>
      )}
      {origin && (
        <p className="text-xs text-gray-600" dir="ltr" data-testid="offset-origin">
          {mode === 'shift' ? t('offset.startHere') : t('offset.origin')} {origin.label}:{' '}
          {formatGrid(origin.x, origin.y)}
        </p>
      )}

      <div className="flex gap-4">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="input"
            checked={inputKind === 'dxdy'}
            onChange={() => setInputKind('dxdy')}
          />
          {t('offset.dxdy')}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="input"
            checked={inputKind === 'bearing'}
            onChange={() => setInputKind('bearing')}
          />
          {t('offset.distanceBearing')}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label>
          {inputKind === 'dxdy' ? t('offset.dx') : t('offset.distance')}
          <input
            inputMode="decimal"
            dir="ltr"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className={input}
          />
        </label>
        <label>
          {inputKind === 'dxdy' ? t('offset.dy') : t('offset.bearing')}
          <input
            inputMode="decimal"
            dir="ltr"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {inputKind === 'bearing' && (
        <p className="text-xs text-gray-500">{t('offset.bearingNote')}</p>
      )}
      <label className="block">
        {t('form.accuracy')}
        <input
          inputMode="decimal"
          dir="ltr"
          value={accuracy}
          onChange={(e) => setAccuracy(e.target.value)}
          className={input}
        />
      </label>

      {target.data && offset && (
        <p
          className="rounded bg-green-50 px-2 py-1 font-mono text-xs"
          dir="ltr"
          data-testid="offset-target"
        >
          {formatGrid(Number(target.data.x), Number(target.data.y))}
          <br />
          {formatLatLon(Number(target.data.lat), Number(target.data.lon))}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!origin || !offset || !target.data || busy}
          onClick={() =>
            origin &&
            offset &&
            target.data &&
            onUse({ target: target.data, offset, origin, accuracy: parseNumber(accuracy) })
          }
          className="rounded bg-green-800 px-3 py-1 text-white disabled:opacity-50"
        >
          {busy ? t('form.saving') : t('offset.use')}
        </button>
        <button type="button" onClick={onCancel} className="underline">
          {t('form.cancel')}
        </button>
      </div>
    </div>
  );
}
