import { useEffect, useRef } from 'react';
import L from 'leaflet';

// Thin wrapper over plain Leaflet (BSD-2). react-leaflet is not used because of its
// Hippocratic-2.1 licence, see docs/LICENCE_REGISTER.md. Layers are added by the caller.

// Terra Garden, Expo City Dubai: centroid of TG_boundary, used until the site loads.
const TERRA_GARDEN_CENTRE: L.LatLngTuple = [24.95875, 55.15449];

type Props = {
  center?: L.LatLngTuple;
  zoom?: number;
  onReady?: (map: L.Map | null) => void;
  className?: string;
  /** Canvas is fast for thousands of points (main map); small maps can use SVG. */
  preferCanvas?: boolean;
};

export function LeafletMap({
  center = TERRA_GARDEN_CENTRE,
  zoom = 18,
  onReady,
  className,
  preferCanvas = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Canvas renderer keeps thousands of asset points fast (NFR-02).
    const map = L.map(containerRef.current, { preferCanvas, maxZoom: 22 }).setView(center, zoom);
    onReady?.(map);
    return () => {
      onReady?.(null);
      // Stop pan or zoom animations, then remove drawn layers while their canvas renderer still
      // exists. map.remove() alone can drop the renderer first, and a path removed after it
      // schedules a redraw on a destroyed canvas (Leaflet 1.9 "reading 'clearRect'").
      map.stop();
      map.eachLayer((layer) => {
        if (!(layer instanceof L.Renderer)) map.removeLayer(layer);
      });
      map.remove();
    };
    // Map is created once; callers use the instance from onReady for later changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaflet positions tooltips and controls for left-to-right layout; keep the map itself LTR
  // in Arabic too (the page around it stays RTL).
  return <div ref={containerRef} dir="ltr" className={className ?? 'h-full w-full'} />;
}
