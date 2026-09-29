import { useEffect, useRef } from 'react';
import L from 'leaflet';

// Thin wrapper over plain Leaflet (BSD-2). react-leaflet is not used because of its
// Hippocratic-2.1 licence, see docs/LICENCE_REGISTER.md.

// Terra Garden, Expo City Dubai (approximate centre; replaced by site extent in Phase 1).
const TERRA_GARDEN_CENTRE: L.LatLngTuple = [24.9636, 55.1508];

type Props = {
  center?: L.LatLngTuple;
  zoom?: number;
  onReady?: (map: L.Map) => void;
  className?: string;
};

export function LeafletMap({ center = TERRA_GARDEN_CENTRE, zoom = 17, onReady, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current).setView(center, zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    onReady?.(map);
    return () => {
      map.remove();
    };
    // Map is created once; callers use the instance from onReady for later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className ?? 'h-full w-full'} />;
}
