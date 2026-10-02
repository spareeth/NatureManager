import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LeafletMap } from '../components/LeafletMap';
import { useNavigate } from 'react-router-dom';
import { useCurrentSite } from '../org/useSite';
import { fetchAssetDetail, fetchAssets, fetchLocations, fetchMapSite } from '../map/api';
import { CursorReadout } from '../map/CursorReadout';
import { Legend } from '../map/Legend';
import { legendZones } from '../map/style';
import {
  createOverlays,
  setAssets,
  setLocations,
  useBaseLayers,
  type MapLayers,
} from '../map/useMapLayers';

type BBox = { west: number; south: number; east: number; north: number };

const bboxOf = (map: L.Map): BBox => {
  const b = map.getBounds().pad(0.1);
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
};
// Round so small pans reuse the cached query (about 10 m).
const roundBox = (b: BBox): BBox => ({
  west: Math.floor(b.west * 1e4) / 1e4,
  south: Math.floor(b.south * 1e4) / 1e4,
  east: Math.ceil(b.east * 1e4) / 1e4,
  north: Math.ceil(b.north * 1e4) / 1e4,
});

export function MapPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [map, setMap] = useState<L.Map | null>(null);
  const [overlays, setOverlays] = useState<MapLayers | null>(null);
  const [bbox, setBbox] = useState<BBox | null>(null);

  const sites = useCurrentSite();
  const siteId = sites.site?.id;
  const siteRef = useRef<string | undefined>(undefined);
  const navigateRef = useRef(navigate);
  const tRef = useRef(t);
  useEffect(() => {
    siteRef.current = siteId;
    navigateRef.current = navigate;
    tRef.current = t;
  }, [siteId, navigate, t]);
  const site = useQuery({
    queryKey: ['map-site', siteId],
    enabled: !!siteId,
    queryFn: () => fetchMapSite(siteId!),
  });
  const locations = useQuery({
    queryKey: ['map-locations', siteId],
    enabled: !!siteId,
    queryFn: () => fetchLocations(siteId!),
  });
  const assets = useQuery({
    queryKey: ['map-assets', siteId, bbox],
    enabled: !!siteId && !!bbox,
    queryFn: () => fetchAssets(siteId!, bbox!),
    placeholderData: (prev) => prev,
  });

  // Overlays live as long as the map; the asset query follows the visible bounding box.
  const onReady = useCallback((m: L.Map | null) => {
    if (!m) {
      setMap(null);
      setOverlays(null);
      return;
    }
    setOverlays(
      createOverlays(
        m,
        (tag) => (siteRef.current ? fetchAssetDetail(siteRef.current, tag) : Promise.resolve(null)),
        (id) => navigateRef.current(`/assets/${id}`),
        () => tRef.current('map.openAsset'),
      ),
    );
    m.on('moveend', () => setBbox(roundBox(bboxOf(m))));
    setMap(m);
  }, []);

  useBaseLayers(map, site.data, overlays, t);

  // Fit the site once it loads.
  useEffect(() => {
    if (!map || !site.data) return;
    const [w, s, e, n] = site.data.bbox;
    // fitBounds fires moveend, which sets the asset bounding box.
    map.fitBounds(
      [
        [s, w],
        [n, e],
      ],
      { animate: false },
    );
  }, [map, site.data]);

  useEffect(() => {
    if (map && overlays && locations.data) setLocations(overlays, locations.data, map);
  }, [map, overlays, locations.data]);

  useEffect(() => {
    if (overlays && assets.data) setAssets(overlays, assets.data.features);
  }, [overlays, assets.data]);

  const zones = useMemo(
    () =>
      legendZones(
        (locations.data?.features ?? [])
          .filter((f) => f.properties.kind === 'zone')
          .map((f) => f.properties.code),
      ),
    [locations.data],
  );
  const error = sites.error ?? site.error ?? locations.error ?? assets.error;

  return (
    <section className="relative flex h-full flex-col">
      <h1 className="sr-only">
        {t('map.heading')}
        {site.data ? `: ${site.data.name}` : ''}
      </h1>
      <LeafletMap className="min-h-0 flex-1" onReady={onReady} />
      <Legend zones={zones} />
      <CursorReadout map={map} siteId={siteId} hasGrid={site.data?.has_grid ?? false} />
      {sites.sites && sites.sites.length === 0 && (
        <p
          role="status"
          className="absolute start-1/2 top-4 z-[1000] -translate-x-1/2 rounded bg-white px-3 py-1 shadow"
        >
          {t('map.noSite')}
        </p>
      )}
      {assets.data && (
        <p
          className="absolute bottom-6 end-2 z-[1000] rounded bg-white/90 px-2 py-1 text-xs shadow"
          data-testid="asset-count"
        >
          {t('map.assetCount', {
            count: assets.data.features.features.length,
            n: assets.data.features.features.length.toLocaleString(i18n.language),
          })}
          {assets.data.truncated && ` ${t('map.truncated')}`}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="absolute start-1/2 top-4 z-[1000] -translate-x-1/2 rounded bg-red-50 px-3 py-1 text-red-800 shadow"
        >
          {error.message}
        </p>
      )}
    </section>
  );
}
