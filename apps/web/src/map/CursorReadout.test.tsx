import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import L from 'leaflet';
import '../i18n';
import { CursorReadout } from './CursorReadout';

const fetchLocalXY = vi.fn(async () => ({ x: 131.71, y: 97.69 }));
vi.mock('./api', () => ({ fetchLocalXY: (...a: unknown[]) => fetchLocalXY(...(a as [])) }));

function fakeMap() {
  const handlers: Record<string, (e?: unknown) => void> = {};
  return {
    on: (ev: string, h: (e?: unknown) => void) => (handlers[ev] = h),
    off: () => {},
    fire: (ev: string, e?: unknown) => handlers[ev]?.(e),
  };
}

describe('CursorReadout', () => {
  it('shows lat/lon at once and site grid from the database', async () => {
    const map = fakeMap();
    render(<CursorReadout map={map as unknown as L.Map} siteId="site-1" hasGrid />);
    expect(screen.getByTestId('cursor-readout')).toHaveTextContent('Move the cursor over the map');
    act(() => map.fire('mousemove', { latlng: L.latLng(24.95875, 55.15449) }));
    expect(screen.getByTestId('cursor-readout')).toHaveTextContent('24.958750° N, 55.154490° E');
    await waitFor(() =>
      expect(screen.getByTestId('cursor-readout')).toHaveTextContent('x 131.71 m, y 97.69 m'),
    );
    expect(fetchLocalXY).toHaveBeenCalledWith('site-1', 55.15449, 24.95875);
    act(() => map.fire('mouseout'));
    expect(screen.getByTestId('cursor-readout')).toHaveTextContent('Move the cursor over the map');
  });

  it('says when the site has no grid and does not query', () => {
    fetchLocalXY.mockClear();
    const map = fakeMap();
    render(<CursorReadout map={map as unknown as L.Map} siteId="site-1" hasGrid={false} />);
    act(() => map.fire('mousemove', { latlng: L.latLng(1, 2) }));
    expect(screen.getByTestId('cursor-readout')).toHaveTextContent('No site grid set');
    expect(fetchLocalXY).not.toHaveBeenCalled();
  });
});
