import { useEffect } from 'react';
import L from 'leaflet';
import type { FeatureCollection, MultiPolygon, Point } from 'geojson';
import type { TFunction } from 'i18next';
import type { AssetDetail, AssetProps, LocationProps } from './api';
import { statusColour, zoneColour } from './style';
import { formatGrid } from './format';
import { createSatelliteSession, viewportAttribution } from './googleTiles';
import { FALLBACK, resolveBasemaps, tileLayerFor, type Basemap } from './basemaps';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const BED_LABEL_MIN_ZOOM = 19;

export type MapLayers = {
  beds: L.GeoJSON;
  zones: L.GeoJSON;
  assets: L.GeoJSON;
  controls: L.LayerGroup;
  /** Open work orders with a place (requests and jobs), by status. */
  work: L.LayerGroup;
};

export type ReportTarget = { id: string; tag_code: string; lat: number; lon: number };

/** Base layers (the site's list, site_basemap) and the layer switcher. Opens on the site default.
 *  Rebuilt when the language or the list changes. */
export function useBaseLayers(
  map: L.Map | null,
  basemaps: Basemap[] | undefined,
  overlays: MapLayers | null,
  t: TFunction,
) {
  useEffect(() => {
    if (!map || !overlays || !basemaps) return;
    const { layers, defaultId } = resolveBasemaps(basemaps);
    const googleRow = layers.find((b) => b.kind === 'google');
    const bases: Record<string, L.GridLayer> = {};
    // Standard layers are translated; a site's own layers keep their name.
    const label = (b: Basemap) => t(`map.layers.named.${b.name}`, { defaultValue: b.name });
    for (const b of layers) if (b.kind !== 'google') bases[label(b)] = tileLayerFor(b);
    // Shown until Google's session is ready when Google is the default.
    const first = layers.find((b) => b.kind !== 'google') ?? FALLBACK;
    if (!bases[label(first)]) bases[label(first)] = tileLayerFor(first);

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

    const defaultRow = layers.find((b) => b.id === defaultId)!;
    const opening = defaultRow.kind === 'google' ? bases[label(first)]! : bases[label(defaultRow)]!;
    opening.addTo(map);
    const control = L.control.layers(bases, {
      [t('map.layers.beds')]: overlays.beds,
      [t('map.layers.zones')]: overlays.zones,
      [t('map.layers.assets')]: overlays.assets,
      [t('map.layers.controlPoints')]: overlays.controls,
      [t('map.layers.work')]: overlays.work,
    });
    control.addTo(map);

    let onMove: (() => void) | null = null;
    if (googleRow && GOOGLE_KEY) {
      createSatelliteSession(GOOGLE_KEY)
        .then((s) => {
          if (cancelled) return;
          google = L.tileLayer(s.tileUrl, {
            maxZoom: googleRow.max_zoom,
            maxNativeZoom: googleRow.max_native_zoom,
          });
          control.addBaseLayer(google, label(googleRow));
          if (defaultRow.kind === 'google' && map.hasLayer(opening)) {
            map.removeLayer(opening);
            google.addTo(map);
            void updateAttribution(s.session);
          }
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
  }, [map, basemaps, overlays, t]);
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
  onReport?: (a: ReportTarget) => void,
  reportLabel: () => string = () => 'Report a problem',
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
                : '') +
              (onReport ? `<br><a href="#" data-report>${escapeHtml(reportLabel())}</a>` : ''),
          );
          const latlng = (layer as L.CircleMarker).getLatLng();
          layer
            .getPopup()
            ?.getElement()
            ?.querySelector<HTMLAnchorElement>('a[data-report]')
            ?.addEventListener('click', (ev) => {
              ev.preventDefault();
              map.closePopup();
              onReport?.({ id: d.id, tag_code: d.tag_code, lat: latlng.lat, lon: latlng.lng });
            });
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
  // Control points draw above assets, as blue diamonds with their code.
  const controls = L.layerGroup();
  const work = L.layerGroup();
  zones.addTo(map);
  beds.addTo(map);
  assets.addTo(map);
  controls.addTo(map);
  work.addTo(map);

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
  return { beds, zones, assets, controls, work };
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

export function setControlPoints(
  layers: MapLayers,
  points: { code: string; lat: number; lon: number; description: string | null }[],
) {
  layers.controls.clearLayers();
  for (const c of points) {
    L.marker([Number(c.lat), Number(c.lon)], {
      icon: L.divIcon({
        className: 'cp-icon',
        html: '<span></span>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      keyboard: false,
    })
      .bindTooltip(escapeHtml(c.code), {
        permanent: true,
        direction: 'right',
        className: 'bed-label',
      })
      .bindPopup(
        `<strong>${escapeHtml(c.code)}</strong>${c.description ? `<br>${escapeHtml(c.description)}` : ''}`,
      )
      .addTo(layers.controls);
  }
}

export type WorkPoint = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  wo_type: string;
  lon: number | null;
  lat: number | null;
};

/** Open work on the asset map: small squares (assets are circles), coloured by status, with a link
 *  to the work order. */
export function setWork(
  layers: MapLayers,
  items: WorkPoint[],
  colour: (status: string) => string,
  statusLabel: (status: string) => string,
  onOpen: (id: string) => void,
  openLabel: string,
) {
  layers.work.clearLayers();
  for (const w of items) {
    if (w.lat == null || w.lon == null) continue;
    const icon = L.divIcon({
      className: 'work-marker',
      html: `<span style="display:block;width:12px;height:12px;border:2px solid #fff;background:${colour(w.status)};box-shadow:0 0 2px #000"></span>`,
      iconSize: [12, 12],
    });
    const m = L.marker([w.lat, w.lon], { icon, title: `${w.number} ${w.title}` });
    m.bindPopup(
      `<strong>${escapeHtml(w.number)}</strong> ${escapeHtml(w.priority)}<br>${escapeHtml(w.title)}` +
        `<br>${escapeHtml(statusLabel(w.status))}<br><a href="/work/${w.id}" data-wo>${escapeHtml(openLabel)}</a>`,
    );
    m.on('popupopen', () => {
      m.getPopup()
        ?.getElement()
        ?.querySelector<HTMLAnchorElement>('a[data-wo]')
        ?.addEventListener('click', (ev) => {
          ev.preventDefault();
          onOpen(w.id);
        });
    });
    m.addTo(layers.work);
  }
}
