import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OffsetPanel } from './OffsetPanel';

const api = vi.hoisted(() => ({
  listControlPoints: vi.fn(),
  nearestCorner: vi.fn(),
  sitePoint: vi.fn(),
}));
vi.mock('./api', () => api);

function renderPanel(props: Partial<Parameters<typeof OffsetPanel>[0]> = {}) {
  const onUse = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OffsetPanel
        map={null}
        siteId="s1"
        mode="origin"
        title="Offset"
        onUse={onUse}
        onCancel={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onUse };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listControlPoints.mockResolvedValue({
    rows: [
      {
        id: 'cp1',
        code: 'CP-01',
        description: 'Gate pin',
        x: 10,
        y: 20,
        lon: 55.15,
        lat: 24.95,
        accuracy_m: 0.02,
      },
    ],
  });
  api.sitePoint.mockImplementation(async (_s: string, _sys: string, x: number, y: number) => ({
    x,
    y,
    lon: 55.151,
    lat: 24.951,
    e: 1,
    n: 2,
  }));
});

describe('OffsetPanel', () => {
  it('places from a control point with dx, dy and previews the target', async () => {
    const { onUse } = renderPanel();
    await screen.findByRole('option', { name: 'CP-01 · Gate pin' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Control point' }), {
      target: { value: 'cp1' },
    });
    fireEvent.change(screen.getByLabelText('dx (m, grid east)'), { target: { value: '2,5' } });
    fireEvent.change(screen.getByLabelText('dy (m, grid north)'), { target: { value: '-1' } });
    await waitFor(() =>
      expect(screen.getByTestId('offset-target')).toHaveTextContent('x 12.50 m, y 19.00 m'),
    );
    expect(api.sitePoint).toHaveBeenLastCalledWith('s1', 'grid', 12.5, 19);
    fireEvent.change(screen.getByLabelText('Accuracy (m)'), { target: { value: '0.05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this position' }));
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: { dx: 2.5, dy: -1 },
        accuracy: 0.05,
        origin: expect.objectContaining({ label: 'CP-01' }),
      }),
    );
  });

  it('accepts distance and grid bearing', async () => {
    renderPanel();
    await screen.findByRole('option', { name: 'CP-01 · Gate pin' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Control point' }), {
      target: { value: 'cp1' },
    });
    fireEvent.click(screen.getByLabelText('Distance and bearing'));
    fireEvent.change(screen.getByLabelText('Distance (m)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Bearing (degrees)'), { target: { value: '90' } });
    await waitFor(() => expect(api.sitePoint).toHaveBeenLastCalledWith('s1', 'grid', 15, 20));
    expect(screen.getByText(/clockwise from grid north/)).toBeInTheDocument();
  });

  it('needs an origin and a valid offset before it can be used', async () => {
    renderPanel();
    await screen.findByRole('combobox', { name: 'Control point' });
    expect(screen.getByRole('button', { name: 'Use this position' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('dx (m, grid east)'), { target: { value: 'two' } });
    expect(screen.getByRole('button', { name: 'Use this position' })).toBeDisabled();
  });

  it('shift mode starts from the asset itself', async () => {
    const { onUse } = renderPanel({
      mode: 'shift',
      start: { label: 'WG07-G01_ALO', x: 100, y: 50, lon: 55.15, lat: 24.95, accuracy: null },
    });
    expect(screen.queryByRole('combobox', { name: 'Control point' })).not.toBeInTheDocument();
    expect(screen.getByTestId('offset-origin')).toHaveTextContent('WG07-G01_ALO');
    fireEvent.change(screen.getByLabelText('dx (m, grid east)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('dy (m, grid north)'), { target: { value: '0' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Use this position' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use this position' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ offset: { dx: 3, dy: 0 } }));
  });
});
