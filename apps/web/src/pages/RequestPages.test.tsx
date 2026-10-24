import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { RequestsPage } from './RequestsPage';
import { RequestDetailPage } from './RequestDetailPage';

const api = vi.hoisted(() => ({
  fetchRequests: vi.fn(),
  fetchRequest: vi.fn(),
  fetchIrAllowed: vi.fn(),
  irTransition: vi.fn(),
  createRequest: vi.fn(),
  updateRequest: vi.fn(),
  deleteRequest: vi.fn(),
  saveLine: vi.fn(),
  deleteLine: vi.fn(),
  fetchItems: vi.fn(),
  saveItem: vi.fn(),
  generatePlantItems: vi.fn(),
  fetchSiteLocations: vi.fn(),
  assetIdByTag: vi.fn(),
}));
vi.mock('../requests/api', async (orig) => ({
  ...(await orig<typeof import('../requests/api')>()),
  ...api,
}));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

function renderAt(path: string, roles: Role[] = ['manager']) {
  const org: OrgState = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 'terra',
      roles,
      displayName: 'M',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

const DRAFT = {
  id: 'r1',
  organisation_id: 'o1',
  number: 'IR-2026-000001',
  status: 'draft',
  source: 'plant_death',
  site_id: 's1',
  location_id: 'l1',
  location_code: 'NG-04',
  work_order_id: null,
  work_order_number: null,
  needed_by: null,
  notes: 'Drafted automatically: NG04-T12_ACA recorded dead',
  requested_by: null,
  requested_by_name: null,
  approved_by_name: null,
  approved_at: null,
  external_ref: null,
  total_aed: 0,
  lines: [
    {
      id: 'li1',
      line_no: 1,
      item_id: 'i1',
      item_code: 'PLT-ACA',
      description: 'Acacia arabica, replacement for NG04-T12_ACA',
      reason: 'replace',
      quantity: 1,
      unit: 'each',
      est_unit_cost: 250,
      asset_id: 'a1',
      asset_tag: 'NG04-T12_ACA',
    },
  ],
  events: [
    {
      at: '2026-10-24T08:00:00Z',
      from: null,
      to: 'draft',
      note: 'drafted from asset NG04-T12_ACA',
      system: 'asset_trigger',
      by: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchItems.mockResolvedValue([
    {
      id: 'i1',
      code: 'PLT-ACA',
      name: 'Acacia arabica',
      category: 'plant',
      unit: 'each',
      taxon_id: 't1',
      external_code: null,
      active: true,
    },
    {
      id: 'i2',
      code: 'MUL-01',
      name: 'Mulch',
      category: 'soil_amendment',
      unit: 'm3',
      taxon_id: null,
      external_code: 'ECD-4711',
      active: true,
    },
  ]);
  api.fetchRequest.mockResolvedValue(DRAFT);
  api.fetchIrAllowed.mockResolvedValue([
    { to_status: 'cancelled', note_required: false },
    { to_status: 'submitted', note_required: false },
  ]);
  api.irTransition.mockResolvedValue({});
  api.saveLine.mockResolvedValue(undefined);
});

describe('item requests', () => {
  it('lists open requests with source, location and total', async () => {
    api.fetchRequests.mockResolvedValue([
      {
        id: 'r1',
        number: 'IR-2026-000001',
        status: 'submitted',
        source: 'work_order',
        needed_by: '2026-11-15',
        created_at: '',
        location_code: 'NG-01',
        work_order_number: 'WO-2026-000005',
        requested_by_name: 'Green One',
        lines: 2,
        reasons: ['maintain'],
        total_aed: 300,
        summary: 'Mulch; Tree tie',
      },
    ]);
    renderAt('/requests');
    const row = await screen.findByTestId('ir-IR-2026-000001');
    expect(row).toHaveTextContent('Submitted');
    expect(row).toHaveTextContent('Work order (WO-2026-000005)');
    expect(row).toHaveTextContent('300.00 AED');
    expect(api.fetchRequests).toHaveBeenCalledWith('s1', [
      'draft',
      'submitted',
      'approved',
      'sent',
      'acknowledged',
    ]);
  });

  it('shows an auto-drafted replacement and submits it', async () => {
    renderAt('/requests/r1');
    expect(
      await screen.findByText('Acacia arabica, replacement for NG04-T12_ACA'),
    ).toBeInTheDocument();
    expect(screen.getByText('Plant death')).toBeInTheDocument();
    expect(screen.getByTestId('ir-total')).toHaveTextContent('250.00 AED');
    expect(screen.getByTestId('ir-history')).toHaveTextContent('asset_trigger');
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    await waitFor(() =>
      expect(api.irTransition).toHaveBeenCalledWith('r1', 'submitted', undefined),
    );
  });

  it('adds a line from the catalogue to a draft', async () => {
    renderAt('/requests/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Add line' }));
    const form = screen.getByRole('form', { name: 'Line' });
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'i2' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Unit cost (AED)'), { target: { value: '150' } });
    fireEvent.submit(form);
    await waitFor(() =>
      expect(api.saveLine).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'r1' }),
        expect.objectContaining({
          item_id: 'i2',
          description: 'Mulch',
          unit: 'm3',
          quantity: 2,
          est_unit_cost: 150,
          reason: 'maintain',
        }),
      ),
    );
  });

  it('a submitted request can be rejected only with a reason', async () => {
    api.fetchRequest.mockResolvedValue({ ...DRAFT, status: 'submitted' });
    api.fetchIrAllowed.mockResolvedValue([
      { to_status: 'approved', note_required: false },
      { to_status: 'rejected', note_required: true },
    ]);
    vi.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('Not in budget');
    renderAt('/requests/r1');
    expect(screen.queryByRole('button', { name: 'Add line' })).toBeNull();
    const reject = await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(reject);
    expect(api.irTransition).not.toHaveBeenCalled();
    fireEvent.click(reject);
    await waitFor(() =>
      expect(api.irTransition).toHaveBeenCalledWith('r1', 'rejected', 'Not in budget'),
    );
  });

  it('catalogue: manager adds plant items from taxa', async () => {
    api.generatePlantItems.mockResolvedValue(3);
    renderAt('/requests?tab=catalogue');
    expect(await screen.findByText('ECD-4711')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add plant items from taxa' }));
    expect(await screen.findByText('3 plant items added.')).toBeInTheDocument();
  });

  it('catalogue is read-only for the green team', async () => {
    renderAt('/requests?tab=catalogue', ['green_team']);
    expect(await screen.findByText('ECD-4711')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New item' })).toBeNull();
  });
});
