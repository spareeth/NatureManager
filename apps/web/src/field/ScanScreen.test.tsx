import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { ScanScreen } from './ScanScreen';

const api = vi.hoisted(() => ({ fetchScan: vi.fn(), moveJob: vi.fn() }));
const labels = vi.hoisted(() => ({ assetByCode: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('../labels/api', () => labels);
vi.mock('../work/api', () => ({ raiseRequest: vi.fn() }));
// The camera is not available in tests; the screen gets a code as if it had been scanned.
vi.mock('./Scanner', () => ({
  Scanner: ({ onCode }: { onCode: (t: string) => void }) => (
    <button type="button" onClick={() => onCode('https://garden.example.org/a/WG07-T04_PRO')}>
      fake scan
    </button>
  ),
}));

const ASSET = {
  id: 'a1',
  organisation_id: 'o1',
  site_id: 's1',
  tag_code: 'WG07-T04_PRO',
  name: null,
  status: 'established',
  location_id: 'l1',
  location_code: 'WG-07',
  scientific_name: 'Prosopis cineraria',
  lon: 55.15,
  lat: 24.95,
  jobs: [
    {
      id: 'w1',
      number: 'WO-1',
      title: 'Prune',
      status: 'scheduled',
      priority: 'P3',
      planned_start: null,
      mine: true,
    },
    {
      id: 'w2',
      number: 'WO-2',
      title: 'Inspect',
      status: 'approved',
      priority: 'P2',
      planned_start: null,
      mine: false,
    },
  ],
};

function renderScan() {
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
      displayName: 'G',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={['/field/scan']}>
          <Routes>
            <Route path="/field/scan" element={<ScanScreen />} />
            <Route path="/field/jobs/:id" element={<p>job page</p>} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  labels.assetByCode.mockResolvedValue({
    id: 'a1',
    organisation_id: 'o1',
    tag_code: 'WG07-T04_PRO',
    matched: 'tag',
  });
  api.fetchScan.mockResolvedValue(ASSET);
  api.moveJob.mockResolvedValue({});
});

describe('ScanScreen', () => {
  it('a scanned label opens the asset with its open jobs', async () => {
    renderScan();
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));
    expect(await screen.findByRole('heading', { name: 'WG07-T04_PRO' })).toBeInTheDocument();
    expect(labels.assetByCode).toHaveBeenCalledWith('WG07-T04_PRO', 'o1');
    expect(screen.getByRole('link', { name: 'Open asset' })).toHaveAttribute('href', '/assets/a1');
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute(
      'href',
      '/field/jobs/w2',
    );
  });

  it('starts my scheduled job and opens it', async () => {
    renderScan();
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start job' }));
    await waitFor(() => expect(api.moveJob).toHaveBeenCalledWith('w1', 'in_progress'));
    expect(await screen.findByText('job page')).toBeInTheDocument();
  });

  it('a typed code that matches nothing says so', async () => {
    labels.assetByCode.mockResolvedValue(null);
    renderScan();
    fireEvent.change(screen.getByLabelText('Type a tag or barcode'), {
      target: { value: 'NOPE-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Asset not found')).toBeInTheDocument();
  });

  it('offers to raise a request for the asset', async () => {
    renderScan();
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));
    fireEvent.click(await screen.findByRole('button', { name: /Report/ }));
    expect(await screen.findByRole('button', { name: /Cancel/ })).toBeInTheDocument();
  });
});
