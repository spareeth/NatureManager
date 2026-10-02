import { useEffect } from 'react';
import L from 'leaflet';
import type { FeatureCollection, MultiPolygon, Point } from 'geojson';
import type { TFunction } from 'i18next';
import type { AssetDetail, AssetProps, LocationProps, MapSite } from './api';
import { statusColour, zoneColour } from './style';
import { formatGrid } from './format';
import { createSatelliteSession, viewportAttribution } from './googleTiles';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const BED_LABEL_MIN_ZOOM = 19;

export type MapLayers = {
  beds: L.GeoJSON;
  zones: L.GeoJSON;
  assets: L.GeoJSON;
};

/** Base layers and the layer switcher. Rebuilt when the language or site basemap changes. */
export function useBaseLayers(
  map: L.Map | null,
  site: MapSite | undefined,
  overlays: MapLayers | null,
  t: TFunction,
) {
  useEffect(() => {
    if (!map || !overlays) return;
    const bases: Record<string, L.TileLayer> = {
      [t('map.layers.osm')]: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }),
    };
    if (site?.basemap_url) {
      bases[t('map.layers.orthophoto')] = L.tileLayer(site.basemap_url, {
        maxZoom: 22,
        maxNativeZoom: 21,
      });
    }

    let google: L.TileLayer | null = null;
    let shownAttribution: string | null = null;
    let cancelled = false;
    const updateAttribution = async (session: string) => {
      if (!google || !map.hasLayer(google)) return;
      const b = map.getBounds();
      const text = await viewportAttribution(GOOGLE_KEY!, session, map.getZoom(), {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
      if (cancelled || !map.hasLayer(google)) return;
      if (shownAttribution) map.attributionControl.removeAttribution(shownAttribution);
      map.attributionControl.addAttribution(text);
      shownAttribution = text;
    };
    const clearAttribution = () => {
      if (shownAttribution && !(google && map.hasLayer(google))) {
        map.attributionControl.removeAttribution(shownAttribution);
        shownAttribution = null;
      }
    };

    const active = Object.values(bases)[0]!;
    active.addTo(map);
    const control = L.control.layers(bases, {
      [t('map.layers.beds')]: overlays.beds,
      [t('map.layers.zones')]: overlays.zones,
      [t('map.layers.assets')]: overlays.assets,
    });
    control.addTo(map);

    let onMove: (() => void) | null = null;
    if (GOOGLE_KEY) {
      createSatelliteSession(GOOGLE_KEY)
        .then((s) => {
          if (cancelled) return;
          google = L.tileLayer(s.tileUrl, { maxZoom: 22, maxNativeZoom: 21 });
          control.addBaseLayer(google, t('map.layers.satellite'));
          onMove = () => {
            clearAttribution();
            void updateAttribution(s.session);
          };
          map.on('moveend baselayerchange', onMove);
        })
        .catch((e: unknown) => console.warn(e));
    }

    return () => {
      cancelled = true;
      if (onMove) map.off('moveend baselayerchange', onMove);
      if (shownAttribution) map.attributionControl.removeAttribution(shownAttribution);
      control.remove();
      Object.values(bases).forEach((l) => l.remove());
      google?.remove();
    };
  }, [map, site?.basemap_url, overlays, t]);
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function createOverlays(
  map: L.Map,
  getDetail?: (tag: string) => Promise<AssetDetail | null>,
  onOpen?: (assetId: string) => void,
  openLabel: () => string = () => 'Open',
): MapLayers {
  const zones = L.geoJSON(undefined, {
    style: (f) => ({
      color: zoneColour((f?.properties as LocationProps).zone_code),
      weight: 2,
      dashArray: '6 4',
      fill: false,
    }),
    interactive: false,
  });
  const beds = L.geoJSON(undefined, {
    style: (f) => {
      const c = zoneColour((f?.properties as LocationProps).zone_code);
      return { color: c, weight: 1, fillColor: c, fillOpacity: 0.25 };
    },
    onEachFeature: (f, layer) => {
      const p = f.properties as LocationProps;
      layer.bindTooltip(p.code, { permanent: true, direction: 'center', className: 'bed-label' });
      layer.bindPopup(
        `<strong>${escapeHtml(p.code)}</strong><br>${Math.round(p.area_m2).toLocaleString()} m²`,
      );
    },
  });
  const assets = L.geoJSON(undefined, {
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 4,
        weight: 1,
        color: '#ffffff',
        fillColor: statusColour((f.properties as AssetProps).status),
        fillOpacity: 0.9,
      }),
    onEachFeature: (f, layer) => {
      const p = f.properties as AssetProps;
      // Details are fetched on click to keep the point payload small (NFR-02).
      layer.bindPopup(`<strong>${escapeHtml(p.tag_code)}</strong><br>...`);
      layer.on('popupopen', async () => {
        if (!getDetail) return;
        try {
          const d = await getDetail(p.tag_code);
          if (!d) return;
          const xy =
            d.local_x != null && d.local_y != null
              ? `<br>${formatGrid(Number(d.local_x), Number(d.local_y))}`
              : '';
          layer.setPopupContent(
            `<strong>${escapeHtml(d.tag_code)}</strong><br>${escapeHtml(d.scientific_name ?? d.name ?? d.type_name)}` +
              `<br>${escapeHtml(d.status)}${d.location_code ? ` · ${escapeHtml(d.location_code)}` : ''}${xy}` +
              (onOpen
                ? `<br><a href="/assets/${d.id}" data-asset>${escapeHtml(openLabel())}</a>`
                : ''),
          );
          const el = layer
            .getPopup()
            ?.getElement()
            ?.querySelector<HTMLAnchorElement>('a[data-asset]');
          el?.addEventListener('click', (ev) => {
            ev.preventDefault();
            onOpen?.(d.id);
          });
        } catch {
          // keep the short popup
        }
      });
    },
  });
  zones.addTo(map);
  beds.addTo(map);
  assets.addTo(map);

  // Bed labels only when zoomed in, so the garden view stays readable.
  const toggleLabels = () => {
    const show = map.getZoom() >= BED_LABEL_MIN_ZOOM;
    beds.eachLayer((l) => {
      const tip = (l as L.Path).getTooltip();
      if (tip) tip.setOpacity(show ? 0.9 : 0);
    });
  };
  map.on('zoomend', toggleLabels);
  beds.on('add', toggleLabels);
  return { beds, zones, assets };
}

export function setLocations(
  layers: MapLayers,
  fc: FeatureCollection<MultiPolygon, LocationProps>,
  map: L.Map,
) {
  const part = (zone: boolean): FeatureCollection<MultiPolygon, LocationProps> => ({
    ...fc,
    features: fc.features.filter((f) => (f.properties.kind === 'zone') === zone),
  });
  layers.zones.clearLayers().addData(part(true));
  layers.beds.clearLayers().addData(part(false));
  map.fire('zoomend');
}

export function setAssets(layers: MapLayers, fc: FeatureCollection<Point, AssetProps>) {
  layers.assets.clearLayers().addData(fc);
}
