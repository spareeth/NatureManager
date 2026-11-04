import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { RequestsScreen } from './Requests';

const api = vi.hoisted(() => ({ fetchFieldRequests: vi.fn() }));
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

function renderAt(path: string) {
  const org: OrgState = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 'terra',
      roles: ['green_team'],
      displayName: 'Green One',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/field/requests" element={<RequestsScreen />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchFieldRequests.mockResolvedValue({
    offline: false,
    data: {
      open: [
        {
          id: 'w1',
          number: 'WO-2026-000016',
          title: 'Broken drip line at NG-02',
          status: 'requested',
          priority: 'P2',
          wo_type: 'reactive',
          location_code: 'NG-02',
          created_at: '2026-11-03T08:00:00Z',
          created_by_name: 'Green Two',
          mine: false,
          lon: null,
          lat: null,
        },
        {
          id: 'w2',
          number: 'WO-2026-000021',
          title: 'Add a bench',
          status: 'approved',
          priority: 'P4',
          wo_type: 'project',
          location_code: null,
          created_at: '2026-11-03T09:00:00Z',
          created_by_name: 'Green One',
          mine: true,
          lon: null,
          lat: null,
        },
      ],
      mine: [
        {
          kind: 'work',
          id: 'w3',
          number: 'WO-2026-000017',
          title: 'Signage faded',
          status: 'scheduled',
          wo_type: 'reactive',
          location_code: 'SG-03',
          created_at: '2026-11-03T07:00:00Z',
          planned_start: '2026-11-05T03:00:00Z',
          note: null,
        },
        {
          kind: 'work',
          id: 'w4',
          number: 'WO-2026-000009',
          title: 'Paint the fence',
          status: 'cancelled',
          wo_type: 'project',
          location_code: null,
          created_at: '2026-11-01T07:00:00Z',
          planned_start: null,
          note: 'Not this season',
        },
        {
          kind: 'items',
          id: 'r1',
          number: 'IR-2026-000019',
          title: '2 m3 Mulch',
          status: 'approved',
          wo_type: null,
          location_code: 'NG-01',
          created_at: '2026-11-02T07:00:00Z',
          planned_start: null,
          note: null,
        },
      ],
    },
  });
});

describe('field requests', () => {
  it('open requests from everyone, with who raised them, and search', async () => {
    renderAt('/field/requests');
    const list = await screen.findByTestId('open-requests');
    expect(within(list).getByRole('link', { name: /Broken drip line/ })).toHaveAttribute(
      'href',
      '/field/jobs/w1',
    );
    expect(within(list).getByText(/by Green Two/)).toBeInTheDocument();
    expect(within(list).getByText(/by me/)).toBeInTheDocument();
    expect(within(list).getByText('Improvement or modification')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search title, bed or number'), {
      target: { value: 'bench' },
    });
    expect(within(list).queryByText(/Broken drip line/)).toBeNull();
  });

  it('my requests with status, the day it is planned, and a cancellation reason', async () => {
    renderAt('/field/requests?tab=mine');
    const list = await screen.findByTestId('my-requests');
    expect(within(list).getByText(/Scheduled for/)).toBeInTheDocument();
    expect(within(list).getByText('Note: Not this season')).toBeInTheDocument();
    expect(within(list).getByText('IR-2026-000019')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mine (3)' })).toHaveAttribute('aria-selected', 'true');
  });
});
