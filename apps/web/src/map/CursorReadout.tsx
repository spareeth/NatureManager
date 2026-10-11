import { useEffect, useMemo, useState } from 'react';
import type L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { fetchLocalXY } from './api';
import { formatGrid, formatLatLon } from './format';
import { latestThrottled } from './latest';

type Props = { map: L.Map | null; siteId: string | undefined; hasGrid: boolean };

/** Cursor position in WGS 84 and site grid (FR-SITE-09). Grid x, y come from site_to_local. */
export function CursorReadout({ map, siteId, hasGrid }: Props) {
  const { t } = useTranslation();
  const [latlng, setLatlng] = useState<L.LatLng | null>(null);
  const [grid, setGrid] = useState<{ x: number; y: number } | null>(null);

  const lookup = useMemo(
    () =>
      latestThrottled(
        (sid: string, lng: number, lat: number) => fetchLocalXY(sid, lng, lat),
        120,
        (r) => setGrid(r),
        () => setGrid(null),
      ),
    [],
  );

  useEffect(() => {
    if (!map) return;
    const move = (e: L.LeafletMouseEvent) => {
      setLatlng(e.latlng);
      if (siteId && hasGrid) lookup.call(siteId, e.latlng.lng, e.latlng.lat);
    };
    const out = () => {
      lookup.cancel();
      setLatlng(null);
      setGrid(null);
    };
    map.on('mousemove', move);
    map.on('mouseout', out);
    return () => {
      map.off('mousemove', move);
      map.off('mouseout', out);
      lookup.cancel();
    };
  }, [map, siteId, hasGrid, lookup]);

  return (
    // Positioned by the page direction; the coordinates inside always read left to right.
    <div className="pointer-events-none absolute bottom-6 start-2 z-[1000]">
      <div
        className="rounded bg-white/90 px-2 py-1 font-mono text-xs text-gray-800 shadow"
        aria-live="off"
        dir="ltr"
        data-testid="cursor-readout"
      >
        {latlng ? (
          <>
            <div>{formatLatLon(latlng.lat, latlng.lng)}</div>
            <div>{hasGrid ? (grid ? formatGrid(grid.x, grid.y) : '...') : t('map.noGrid')}</div>
          </>
        ) : (
          <div dir="auto">{t('map.cursorHint')}</div>
        )}
      </div>
    </div>
  );
}
