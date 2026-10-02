import { useCallback } from 'react';
import L from 'leaflet';
import type { Geometry } from 'geojson';
import { LeafletMap } from '../components/LeafletMap';
import { statusColour } from '../map/style';

/** Small locator map for the asset detail page. */
export function AssetMiniMap({
  geometry,
  lat,
  lon,
  status,
}: {
  geometry: Geometry;
  lat: number;
  lon: number;
  status: string;
}) {
  const onReady = useCallback(
    (map: L.Map | null) => {
      if (!map) return;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      if (geometry.type === 'Point') {
        L.circleMarker([lat, lon], {
          radius: 7,
          weight: 2,
          color: '#fff',
          fillColor: statusColour(status),
          fillOpacity: 1,
        }).addTo(map);
        map.setView([lat, lon], 20);
      } else {
        const layer = L.geoJSON(geometry, {
          style: { color: statusColour(status), weight: 2, fillOpacity: 0.3 },
        }).addTo(map);
        map.fitBounds(layer.getBounds(), { maxZoom: 21 });
      }
    },
    [geometry, lat, lon, status],
  );
  return (
    <LeafletMap
      preferCanvas={false}
      center={[lat, lon]}
      zoom={20}
      onReady={onReady}
      className="h-56 w-full rounded border"
    />
  );
}
