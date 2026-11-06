import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { LeafletMap } from '../components/LeafletMap';
import { fetchLocations, type LocationProps } from '../map/api';
import { pmtilesLayer } from '../map/pmtilesLayer';
import { fetchBasemaps, KEYS, resolveBasemaps, tileLayerFor } from '../map/basemaps';
import { createSatelliteSession } from '../map/googleTiles';
import { classOf, quantileBreaks, RAMPS, type Overlay } from './api';

export type BedValue = { value: number | null; color?: string; label: string };

/** One indicator the beds can be coloured by. Categorical layers (stress) give a colour per bed and a
 *  legend of their classes; numeric layers are classed by quantiles. */
export type IndicatorLayer = {
  key: string;
  group: string;
  label: string;
  help?: string;
  values: Record<string, BedValue>;
  format?: (v: number) => string;
  classes?: { color: string; label: string }[];
};

type Scale = { nums: number[]; breaks: number[]; ramp: string[]; edges: number[] } | null;

const fmt = (v: number) => (Number.isInteger(v) || Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

function scaleOf(l: IndicatorLayer | undefined, ramp: string[]): Scale {
  if (!l || l.classes) return null;
  const nums = Object.values(l.values)
    .map((v) => v.value)
    .filter((v): v is number => v != null);
  const breaks = quantileBreaks(nums, ramp.length);
  return { nums, breaks, ramp, edges: [Math.min(...nums), ...breaks, Math.max(...nums)] };
}

function colourOf(l: IndicatorLayer, s: Scale, bed: string): string | null {
  const v = l.values[bed];
  if (!v) return null;
  if (v.color) return v.color;
  if (v.value == null || !s) return null;
  return s.ramp[Math.min(s.ramp.length - 1, classOf(v.value, s.breaks))]!;
}

/** Beds coloured by up to two indicators at once (the first fills the beds, the second colours their
 *  outline), over a base map and an optional satellite overlay. Indicators are listed as overlays in
 *  the map, each with a short explanation. */
export function BedMap({
  siteId,
  layers,
  overlays,
  defaultOn = [],
  fillRamp = RAMPS.green,
  testId,
}: {
  siteId: string;
  layers: IndicatorLayer[];
  overlays: Overlay[];
  defaultOn?: string[];
  fillRamp?: string[];
  testId?: string;
}) {
  const { t } = useTranslation();
  const [map, setMap] = useState<L.Map | null>(null);
  const [overlayCode, setOverlayCode] = useState<string>('');
  const [opacity, setOpacity] = useState(0.85);
  const [on, setOn] = useState<string[]>(defaultOn);
  const [panelOpen, setPanelOpen] = useState(true);
  const beds = useQuery({ queryKey: ['locations', siteId], queryFn: () => fetchLocations(siteId) });
  const basemaps = useQuery({
    queryKey: ['basemaps', siteId],
    queryFn: () => fetchBasemaps(siteId),
  });
  const [baseId, setBaseId] = useState<string>('imagery');
  const bases = useMemo(
    () => (basemaps.data ? resolveBasemaps(basemaps.data).layers : []),
    [basemaps.data],
  );
  const imagery = overlays.find((o) => o.kind === 'imagery');
  const overlay = overlays.find((o) => o.code === overlayCode && o.kind !== 'imagery');

  const fill = layers.find((l) => l.key === on[0]);
  const line = layers.find((l) => l.key === on[1]);
  const toggle = (key: string) =>
    setOn((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].slice(-2)));
  const fillScale = useMemo(() => scaleOf(fill, fillRamp), [fill, fillRamp]);
  const lineScale = useMemo(() => scaleOf(line, RAMPS.purple), [line]);

  // Base map
  useEffect(() => {
    if (!map) return;
    let layer: L.GridLayer | null = null;
    let cancelled = false;
    const b = bases.find((x) => x.id === baseId);
    if (baseId === 'imagery' && imagery) {
      layer = pmtilesLayer(imagery.url, {
        maxNativeZoom: imagery.max_zoom,
        maxZoom: 22,
        zIndex: 1,
      });
    } else if (b?.kind === 'google') {
      if (KEYS.google)
        void createSatelliteSession(KEYS.google).then((s) => {
          if (cancelled) return;
          layer = L.tileLayer(s.tileUrl, {
            maxZoom: b.max_zoom,
            maxNativeZoom: b.max_native_zoom,
            attribution: 'Imagery &copy; Google',
            zIndex: 1,
          }).addTo(map);
        });
    } else if (b) {
      layer = tileLayerFor(b);
      layer.setZIndex(1);
    }
    layer?.addTo(map);
    return () => {
      cancelled = true;
      layer?.remove();
    };
  }, [map, imagery, baseId, bases]);

  // Satellite overlay
  useEffect(() => {
    if (!map || !overlay) return;
    const l = pmtilesLayer(overlay.url, {
      maxNativeZoom: overlay.max_zoom,
      maxZoom: 22,
      opacity,
      zIndex: 2,
    });
    l.addTo(map);
    return () => void l.remove();
  }, [map, overlay, opacity]);

  // Beds: fill = first indicator, outline = second; the tooltip lists both.
  useEffect(() => {
    if (!map || !beds.data) return;
    const fc: FeatureCollection<MultiPolygon, LocationProps> = {
      ...beds.data,
      features: beds.data.features.filter((f) => f.properties.kind === 'bed'),
    };
    const shown = [fill, line].filter((l): l is IndicatorLayer => !!l);
    const layer = L.geoJSON(fc, {
      style: (f) => {
        const code = (f as Feature<MultiPolygon, LocationProps>).properties.code;
        const fc1 = fill ? colourOf(fill, fillScale, code) : null;
        const lc = line ? colourOf(line, lineScale, code) : null;
        return {
          color: lc ?? '#14312c',
          weight: lc ? 4 : 1,
          opacity: 0.95,
          fillColor: fc1 ?? '#e5e7eb',
          fillOpacity: fill ? (fc1 ? 0.85 : 0.35) : 0,
        };
      },
      onEachFeature: (f, l) => {
        const code = (f as Feature<MultiPolygon, LocationProps>).properties.code;
        const rows = shown.map((a) => a.values[code]?.label ?? `${a.label}: ${t('kpi.noData')}`);
        l.bindTooltip(
          `<strong>${code}</strong>${rows.length ? '<br/>' + rows.join('<br/>') : ''}`,
          {
            sticky: true,
          },
        );
      },
    }).addTo(map);
    return () => void layer.remove();
  }, [map, beds.data, fill, line, fillScale, lineScale, t]);

  useEffect(() => {
    if (map && beds.data) {
      const b = L.geoJSON(beds.data).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [12, 12] });
    }
  }, [map, beds.data]);

  const groups = [...new Set(layers.map((l) => l.group))];
  const legendFor = (l: IndicatorLayer, s: Scale, asLine: boolean) => (
    <div key={l.key} className="mb-1">
      <p className="font-semibold">
        {asLine ? t('kpi.outline') : t('kpi.fill')}: {l.label}
      </p>
      {l.classes
        ? l.classes.map((c) => (
            <p key={c.label} className="flex items-center gap-2">
              <Swatch color={c.color} line={asLine} />
              {c.label}
            </p>
          ))
        : s &&
          s.nums.length > 0 &&
          s.ramp.slice(0, s.breaks.length + 1).map((c, i) => (
            <p key={c} className="flex items-center gap-2">
              <Swatch color={c} line={asLine} />
              <span className="tabular-nums" dir="ltr">
                {(l.format ?? fmt)(s.edges[i]!)} to {(l.format ?? fmt)(s.edges[i + 1]!)}
              </span>
            </p>
          ))}
    </div>
  );

  return (
    <div className="kpi-map space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          {t('kpi.basemap')}
          <select
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            className="min-h-10 rounded border px-2"
          >
            {imagery && <option value="imagery">{imagery.name}</option>}
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          {t('kpi.layer')}
          <select
            value={overlayCode}
            onChange={(e) => setOverlayCode(e.target.value)}
            className="min-h-10 rounded border px-2"
          >
            <option value="">{t('kpi.noLayer')}</option>
            {overlays
              .filter((o) => o.kind !== 'imagery')
              .map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
        {overlay && (
          <label className="flex items-center gap-2">
            {t('kpi.opacity')}
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
          </label>
        )}
      </div>
      <div className="relative h-[70vh] min-h-[32rem] overflow-hidden rounded border">
        <LeafletMap className="h-full w-full" zoom={17} onReady={setMap} preferCanvas={false} />

        <div
          className="absolute end-2 top-2 z-[1000] w-72 max-w-[calc(100%-1rem)] rounded bg-white/95 text-xs shadow"
          data-testid="indicator-panel"
        >
          <button
            type="button"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((o) => !o)}
            className="flex w-full items-center justify-between px-2 py-1.5 font-semibold"
          >
            {t('kpi.indicators')} {panelOpen ? '▴' : '▾'}
          </button>
          {panelOpen && (
            <div className="max-h-[calc(70vh-6rem)] space-y-2 overflow-auto border-t px-2 py-1.5">
              <p className="text-gray-600">{t('kpi.indicatorsHelp')}</p>
              {groups.map((g) => (
                <fieldset key={g}>
                  <legend className="font-semibold text-gray-800">{g}</legend>
                  {layers
                    .filter((l) => l.group === g)
                    .map((l) => {
                      const pos = on.indexOf(l.key);
                      return (
                        <label key={l.key} className="flex cursor-pointer items-start gap-2 py-0.5">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={pos >= 0}
                            onChange={() => toggle(l.key)}
                          />
                          <span>
                            <span className="font-medium">{l.label}</span>
                            {pos >= 0 && (
                              <span className="ms-1 rounded bg-gray-100 px-1 text-[10px] text-gray-700">
                                {pos === 0 ? t('kpi.fill') : t('kpi.outline')}
                              </span>
                            )}
                            {l.help && <span className="block text-gray-600">{l.help}</span>}
                          </span>
                        </label>
                      );
                    })}
                </fieldset>
              ))}
            </div>
          )}
        </div>

        <div className="absolute bottom-6 start-2 z-[1000] max-w-[60%] rounded bg-white/95 p-2 text-xs shadow">
          {!fill && <p className="text-gray-700">{t('kpi.noIndicator')}</p>}
          {fill && legendFor(fill, fillScale, false)}
          {line && legendFor(line, lineScale, true)}
          {overlay && (
            <div className="mt-1 border-t pt-1">
              <p className="font-semibold">{overlay.name}</p>
              <p className="flex items-center gap-1" dir="ltr">
                {overlay.legend.map(([v, c], i) => (
                  <span key={i} className="flex flex-col items-center">
                    <span className="inline-block h-3 w-6" style={{ background: c }} />
                    <span>{v}</span>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
      </div>
      {overlay?.notes && <p className="text-sm text-gray-700">{overlay.notes}</p>}
    </div>
  );
}

function Swatch({ color, line }: { color: string; line: boolean }) {
  return line ? (
    <span
      className="inline-block h-3 w-5 rounded-sm border-[3px] bg-white"
      style={{ borderColor: color }}
    />
  ) : (
    <span className="inline-block h-3 w-5 rounded-sm" style={{ background: color }} />
  );
}
