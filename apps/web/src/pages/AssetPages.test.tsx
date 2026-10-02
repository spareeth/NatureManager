import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { AssetListPage } from './AssetListPage';
import { AssetDetailPage } from './AssetDetailPage';

const searchAssets = vi.fn();
vi.mock('../assets/api', () => ({
  searchAssets: (...a: unknown[]) => searchAssets(...a),
  fetchAssetTypes: async () => [
    { code: 'TREE', name: 'Tree', asset_class: 'living' },
    { code: 'VALVE', name: 'Irrigation valve', asset_class: 'built' },
  ],
  fetchSiteLocations: async () => [
    { code: 'WG', kind: 'zone' },
    { code: 'WG-07', kind: 'bed' },
  ],
  fetchAssetDetail: async (id: string) =>
    id === 'a1'
      ? {
          id: 'a1',
          site_id: 's1',
          tag_code: 'WG07-T04_PRO',
          barcode: null,
          name: null,
          status: 'declining',
          condition: 3,
          criticality: null,
          install_date: null,
          plant_count: null,
          attributes: { height_m: 6.5 },
          legacy_hortis_id: '2026-0050.A',
          geometry: { type: 'Point', coordinates: [55.154, 24.958] },
          lon: 55.154,
          lat: 24.958,
          local_x: 50,
          local_y: 50.5,
          position_source: 'hortis',
          position_accuracy_m: 0.7,
          created_at: '2026-10-01T04:00:00Z',
          updated_at: '2026-10-01T04:00:00Z',
          type: {
            id: 't',
            code: 'TREE',
            name: 'Tree',
            asset_class: 'living',
            attribute_schema: {
              type: 'object',
              properties: { height_m: { type: 'number', title: 'Height (m)' } },
            },
          },
          taxon: {
            id: 'x',
            scientific_name: 'Prosopis cineraria',
            authorship: '(L.) Druce',
            family: 'Fabaceae',
            common_names: { en: ['Ghaf'] },
            inhouse_code: 'PRO',
            iucn_category: 'LC',
            origin: 'native',
            sensitive: false,
          },
          accession: {
            id: 'ac',
            accession_number: '2026-0050',
            received_date: null,
            source: null,
            provenance_type: 'G',
          },
          location: {
            id: 'l',
            code: 'WG-07',
            name: 'WG-07',
            kind: 'bed',
            zone_code: 'WG',
            zone_name: 'West Garden',
          },
          parent: null,
          children: [],
        }
      : null,
  fetchTimeline: async () => [
    {
      at: '2026-10-01T05:00:00Z',
      kind: 'status',
      by: 'Green One',
      data: { from: 'established', to: 'declining', reason: 'Leaf scorch' },
    },
    { at: '2026-10-01T04:00:00Z', kind: 'created', by: null, data: {} },
  ],
  signPhotos: async () => ({}),
}));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));
vi.mock('../assets/AssetMiniMap', () => ({ AssetMiniMap: () => <div data-testid="mini-map" /> }));

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

function Where() {
  const l = useLocation();
  return <output data-testid="url">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/assets" element={<AssetListPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

describe('asset list page', () => {
  beforeEach(() => {
    searchAssets.mockReset();
    searchAssets.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: 'a1',
          tag_code: 'WG07-T04_PRO',
          status: 'declining',
          condition: 3,
          type_name: 'Tree',
          asset_class: 'living',
          scientific_name: 'Prosopis cineraria',
          inhouse_code: 'PRO',
          location_code: 'WG-07',
          zone_code: 'WG',
          local_x: 50,
          local_y: 50.5,
        },
        {
          id: 'a3',
          tag_code: 'SG03-VLV02',
          status: 'active',
          condition: 5,
          type_name: 'Irrigation valve',
          asset_class: 'built',
          scientific_name: null,
          inhouse_code: null,
          location_code: 'SG-03',
          zone_code: 'SG',
          local_x: 120,
          local_y: 40,
        },
      ],
    });
  });

  it('lists assets with links, status and grid', async () => {
    renderAt('/assets');
    expect(await screen.findByText('2 assets')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'WG07-T04_PRO' });
    expect(link).toHaveAttribute('href', '/assets/a1');
    const row = link.closest('tr')!;
    expect(within(row).getByText('Declining')).toBeInTheDocument();
    expect(within(row).getByText('50.00, 50.50')).toBeInTheDocument();
  });

  it('reads filters from the URL and passes them to the search', async () => {
    renderAt('/assets?q=ghaf&location=WG&status=declining&sort=condition&desc=1');
    await screen.findByText('2 assets');
    expect(searchAssets).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({
        q: 'ghaf',
        location: 'WG',
        status: ['declining'],
        sort: 'condition',
        desc: true,
      }),
    );
  });

  it('search box and sort headers update the URL', async () => {
    renderAt('/assets');
    await screen.findByText('2 assets');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' ghaf ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/assets?q=ghaf'));
    fireEvent.click(screen.getByRole('button', { name: /Condition/ }));
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('q=ghaf&sort=condition'),
    );
    fireEvent.click(screen.getByRole('button', { name: /Condition/ }));
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('sort=condition&desc=1'),
    );
  });

  it('type list follows the class filter', async () => {
    renderAt('/assets?class=built');
    await screen.findByText('2 assets');
    const type = screen.getByRole('combobox', { name: 'Type' });
    expect(within(type).queryByText('Tree')).not.toBeInTheDocument();
    expect(within(type).getByText('Irrigation valve')).toBeInTheDocument();
  });
});

describe('asset detail page', () => {
  it('shows details, position, attributes from the schema and the timeline', async () => {
    renderAt('/assets/a1');
    expect(await screen.findByRole('heading', { name: 'WG07-T04_PRO' })).toBeInTheDocument();
    expect(screen.getByText('PRO')).toBeInTheDocument();
    expect(screen.getByText('Least concern')).toBeInTheDocument();
    expect(screen.getByText('2026-0050 · Garden')).toBeInTheDocument();
    expect(screen.getByText('Height (m)')).toBeInTheDocument();
    expect(screen.getByText('x 50.00 m, y 50.50 m')).toBeInTheDocument();
    expect(screen.getByText('Hortis · ±0.7 m')).toBeInTheDocument();
    expect(screen.getByTestId('mini-map')).toBeInTheDocument();
    const tl = await screen.findByTestId('timeline');
    await waitFor(() =>
      expect(
        within(tl).getByText('Status changed from Established to Declining: Leaf scorch'),
      ).toBeInTheDocument(),
    );
    expect(within(tl).getByText(/Green One/)).toBeInTheDocument();
  });

  it('says when an asset is missing or not visible', async () => {
    renderAt('/assets/nope');
    expect(await screen.findByText(/Asset not found/)).toBeInTheDocument();
  });
});
