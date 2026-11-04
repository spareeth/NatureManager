import { useEffect } from 'react';
import type L from 'leaflet';

/** While active, the next click on the map (not on a control or popup, not the end of a drag) calls
 *  onPick with its position. Crosshair cursor; Esc calls onCancel. */
export function usePickPoint(
  map: L.Map | null,
  active: boolean,
  onPick: (p: { lat: number; lon: number }) => void,
  onCancel: () => void,
) {
  useEffect(() => {
    if (!map || !active) return;
    const container = map.getContainer();
    container.style.cursor = 'crosshair';
    map.closePopup();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: MouseEvent) => (down = { x: e.clientX, y: e.clientY });
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.leaflet-control, .leaflet-popup')) return;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const p = map.mouseEventToLatLng(e);
      onPick({ lat: p.lat, lon: p.lng });
    };
    const onPopup = () => map.closePopup();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    container.addEventListener('mousedown', onDown);
    container.addEventListener('click', onClick);
    map.on('popupopen', onPopup);
    window.addEventListener('keydown', onKey);
    return () => {
      container.style.cursor = '';
      container.removeEventListener('mousedown', onDown);
      container.removeEventListener('click', onClick);
      map.off('popupopen', onPopup);
      window.removeEventListener('keydown', onKey);
    };
  }, [map, active, onPick, onCancel]);
}
