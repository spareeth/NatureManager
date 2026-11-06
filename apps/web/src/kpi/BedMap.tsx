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
import { classOf, quantileBreaks, STRESS_COLOR, type Overlay, type Stress } from './api';

export type BedValue = { value: number | null; color?: string; label: string };

/** Beds coloured by a value (choropleth, quantile classes of one hue) over a satellite overlay. The
 *  overlay is optional; the beds can be hidden to see it. */
export function BedMap({
  siteId,
  values,
  ramp,
  overlays,
  legendTitle,
  format = (v) => String(v),
  testId,
}: {
  siteId: string;
  values: Record<string, BedValue>;
  ramp: string[];
  overlays: Overlay[];
  legendTitle: string;
  format?: (v: number) => string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const [map, setMap] = useState<L.Map | null>(null);
  const [overlayCode, setOverlayCode] = useState<string>('');
  const [opacity, setOpacity] = useState(0.85);
  const [showBeds, setShowBeds] = useState(true);
  const beds = useQuery({ queryKey: ['locations', siteId], queryFn: () => fetchLocations(siteId) });
  const basemaps = useQuery({
    queryKey: ['basemaps', siteId],
    queryFn: () => fetchBasemaps(siteId),
  });
  // Base map: the satellite image of the overlays by default, or one of the site's base maps.
  const [baseId, setBaseId] = useState<string>('imagery');
  const bases = useMemo(
    () => (basemaps.data ? resolveBasemaps(basemaps.data).layers : []),
    [basemaps.data],
  );

  // Satellite image underneath when there is one, so the beds sit on the real ground.
  const imagery = overlays.find((o) => o.kind === 'imagery');
  const overlay = overlays.find((o) => o.code === overlayCode && o.kind !== 'imagery');

  const nums = useMemo(
    () =>
      Object.values(values)
        .map((v) => v.value)
        .filter((v): v is number => v != null),
    [values],
  );
  const breaks = useMemo(() => quantileBreaks(nums, ramp.length), [nums, ramp.length]);

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

  useEffect(() => {
    if (!map || !beds.data) return;
    const fc: FeatureCollection<MultiPolygon, LocationProps> = {
      ...beds.data,
      features: beds.data.features.filter((f) => f.properties.kind === 'bed'),
    };
    const layer = L.geoJSON(fc, {
      style: (f) => {
        const v = values[(f as Feature<MultiPolygon, LocationProps>).properties.code];
        const fill =
          v?.color ??
          (v?.value != null
            ? ramp[Math.min(ramp.length - 1, classOf(v.value, breaks))]
            : '#e5e7eb');
        return {
          color: '#14312c',
          weight: 1,
          fillColor: fill,
          fillOpacity: showBeds ? 0.85 : 0,
          opacity: showBeds ? 0.9 : 0.6,
        };
      },
      onEachFeature: (f, l) => {
        const code = (f as Feature<MultiPolygon, LocationProps>).properties.code;
        const v = values[code];
        l.bindTooltip(`<strong>${code}</strong><br/>${v ? v.label : t('kpi.noData')}`, {
          sticky: true,
        });
      },
    }).addTo(map);
    return () => void layer.remove();
  }, [map, beds.data, values, ramp, breaks, showBeds, t]);

  useEffect(() => {
    if (map && beds.data) {
      const b = L.geoJSON(beds.data).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [12, 12] });
    }
  }, [map, beds.data]);

  const edges = [Math.min(...nums), ...breaks, Math.max(...nums)];
  return (
    <div className="space-y-2" data-testid={testId}>
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
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showBeds}
            onChange={(e) => setShowBeds(e.target.checked)}
          />
          {t('kpi.showBeds')}
        </label>
      </div>
      <div className="relative h-[28rem] overflow-hidden rounded border">
        <LeafletMap className="h-full w-full" zoom={17} onReady={setMap} preferCanvas={false} />
        <div className="absolute bottom-6 start-2 z-[1000] rounded bg-white/95 p-2 text-xs shadow">
          <p className="mb-1 font-semibold">{legendTitle}</p>
          {nums.length > 0 &&
            ramp.slice(0, breaks.length + 1).map((c, i) => (
              <p key={c} className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 rounded-sm" style={{ background: c }} />
                <span className="tabular-nums" dir="ltr">
                  {format(edges[i]!)} to {format(edges[i + 1]!)}
                </span>
              </p>
            ))}
          {nums.length === 0 &&
            Object.values(values).some((v) => v.color) &&
            (Object.keys(STRESS_COLOR) as Stress[]).map((k) => (
              <p key={k} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-5 rounded-sm"
                  style={{ background: STRESS_COLOR[k] }}
                />
                {t(`kpi.stress.${k}`)}
              </p>
            ))}
          {overlay && (
            <div className="mt-2 border-t pt-1">
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
