import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { ControlPointsPage } from './ControlPointsPage';

const api = vi.hoisted(() => ({
  listControlPoints: vi.fn(),
  saveControlPoint: vi.fn(),
  deleteControlPoint: vi.fn(),
  sitePoint: vi.fn(),
}));
vi.mock('../geo/api', () => api);
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));
vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));

const org: OrgState = {
  memberships: [],
  loading: false,
  error: null,
  switchOrg: () => {},
  current: {
    organisationId: 'o1',
    organisationName: 'Terra',
    organisationSlug: 'terra',
    roles: ['field_manager'],
    displayName: 'FM',
  },
};
function renderPage() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter>
          <ControlPointsPage />
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listControlPoints.mockResolvedValue({
    with_reference: 2,
    rmse_m: 0.035,
    max_m: 0.04,
    rows: [
      {
        id: '1',
        code: 'CP-01',
        description: 'Gate pin',
        source: 'rtk',
        accuracy_m: 0.02,
        lat: 24.95,
        lon: 55.15,
        e: 481818,
        n: 2761409,
        x: 10,
        y: 10,
        ref_x: 10,
        ref_y: 10.03,
        dx: 0,
        dy: -0.03,
        residual_m: 0.03,
      },
      {
        id: '2',
        code: 'CP-02',
        description: null,
        source: 'cad',
        accuracy_m: null,
        lat: 24.95,
        lon: 55.16,
        e: 482008,
        n: 2761419,
        x: 200,
        y: 20,
        ref_x: 200.04,
        ref_y: 20,
        dx: -0.04,
        dy: 0,
        residual_m: 0.04,
      },
    ],
  });
  api.sitePoint.mockResolvedValue({
    lon: 55.1544,
    lat: 24.9587,
    e: 481930,
    n: 2761520,
    x: 122,
    y: 121,
  });
  api.saveControlPoint.mockResolvedValue(undefined);
});

describe('control points page', () => {
  it('shows coordinates, residuals and the RMSE', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId('cp-summary')).toHaveTextContent(
        '2 control points, 2 with a reference position. Residual RMSE 0.035 m, largest 0.040 m.',
      ),
    );
    expect(screen.getByTestId('residual-CP-01')).toHaveTextContent('0.030 m');
    expect(screen.getByTestId('residual-CP-02')).toHaveTextContent('dx -0.040, dy 0.000');
  });

  it('adds a control point from Dubai TM coordinates with a reference position', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add control point' }));
    const form = screen.getByRole('form', { name: 'New control point' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('A code is required.');
    fireEvent.change(within(form).getByLabelText('Code'), { target: { value: 'cp-03' } });
    fireEvent.change(within(form).getByLabelText('Easting E (m)'), { target: { value: '481930' } });
    fireEvent.change(within(form).getByLabelText('Northing N (m)'), {
      target: { value: '2761520' },
    });
    await waitFor(() =>
      expect(within(form).getByTestId('cp-preview')).toHaveTextContent('x 122.000, y 121.000'),
    );
    expect(api.sitePoint).toHaveBeenLastCalledWith('s1', 'dltm', 481930, 2761520);
    fireEvent.change(within(form).getAllByLabelText('Grid x (m)').at(-1)!, {
      target: { value: '122.01' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Give both reference x and y, or neither.',
    );
    fireEvent.change(within(form).getAllByLabelText('Grid y (m)').at(-1)!, {
      target: { value: '121,02' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveControlPoint).toHaveBeenCalledWith(
        'o1',
        's1',
        expect.objectContaining({
          code: 'CP-03',
          source: 'rtk',
          ref_x: 122.01,
          ref_y: 121.02,
          ref_source: 'plan',
          lon: 55.1544,
          lat: 24.9587,
        }),
        undefined,
      ),
    );
  });
});
