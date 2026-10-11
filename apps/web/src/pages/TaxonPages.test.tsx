import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { TaxonDetailPage } from './TaxonDetailPage';
import { TaxonListPage } from './TaxonListPage';

const api = vi.hoisted(() => ({
  listTaxa: vi.fn(),
  fetchTaxon: vi.fn(),
  fetchTaxonHistory: vi.fn(),
  updateOrgTaxon: vi.fn(),
}));
vi.mock('../taxa/api', () => api);

const ALOE = {
  id: 'aloe',
  scientific_name: 'Aloe vera',
  authorship: '(L.) Burm.f.',
  family: 'Asphodelaceae',
  genus: 'Aloe',
  rank: 'species',
  gbif_key: null,
  common_names: { en: ['Aloe'] },
  accepted: null,
  org: {
    inhouse_code: null,
    iucn_category: null,
    protection_level: null,
    origin: 'exotic',
    sensitive: false,
    zones_present: ['SG'],
    notes: null,
    attributes: { proposed_inhouse_code: 'ALO', life_forms: ['Succulent'] },
    updated_at: '2026-10-11T00:00:00Z',
  },
  plants_by_zone: { SG: 4 },
  plants_by_status: { established: 4 },
};

function renderAt(path: string, roles: Role[]) {
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
      displayName: 'X',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/taxa" element={<TaxonListPage />} />
            <Route path="/taxa/:id" element={<TaxonDetailPage />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchTaxon.mockResolvedValue(ALOE);
  api.fetchTaxonHistory.mockResolvedValue([
    {
      at: '2026-10-11T08:00:00Z',
      action: 'update',
      by: 'Terra Curator',
      fields: [{ field: 'iucn_category', from: 'EN', to: 'VU' }],
    },
  ]);
  api.updateOrgTaxon.mockResolvedValue(undefined);
});

describe('taxa list', () => {
  it('lists taxa with codes, proposed codes and plant counts linking to the assets', async () => {
    api.listTaxa.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: 'pro',
          scientific_name: 'Prosopis cineraria',
          family: 'Fabaceae',
          common_en: 'Ghaf',
          common_ar: 'غاف',
          inhouse_code: 'PRO',
          proposed_code: null,
          iucn_category: 'LC',
          zones_present: ['WG'],
          plants: 27,
          dead: 0,
          sensitive: false,
        },
        {
          id: 'aloe',
          scientific_name: 'Aloe vera',
          family: 'Asphodelaceae',
          common_en: null,
          common_ar: null,
          inhouse_code: null,
          proposed_code: 'ALO',
          iucn_category: null,
          zones_present: ['SG'],
          plants: 4,
          dead: 1,
          sensitive: true,
        },
      ],
    });
    renderAt('/taxa?code=proposed', ['green_team']);
    expect(await screen.findByText('2 taxa')).toBeInTheDocument();
    expect(api.listTaxa).toHaveBeenCalledWith('o1', expect.objectContaining({ code: 'proposed' }));
    const aloe = screen.getByRole('link', { name: 'Aloe vera' }).closest('tr')!;
    expect(within(aloe).getByText('ALO?')).toBeInTheDocument();
    expect(within(aloe).getByText('sensitive')).toBeInTheDocument();
    expect(within(aloe).getByRole('link', { name: '4' })).toHaveAttribute(
      'href',
      '/assets?q=Aloe%20vera',
    );
    expect(within(aloe).getByText('(1 dead)')).toBeInTheDocument();
  });
});

describe('taxon page', () => {
  it('curator approves the proposed code', async () => {
    renderAt('/taxa/aloe', ['curator']);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve code' }));
    await waitFor(() =>
      expect(api.updateOrgTaxon).toHaveBeenCalledWith('o1', 'aloe', {
        inhouse_code: 'ALO',
        attributes: { life_forms: ['Succulent'] },
      }),
    );
  });

  it('curator edits fields; codes are validated and duplicates explained', async () => {
    renderAt('/taxa/aloe', ['curator']);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit (curator)' }));
    const form = screen.getByRole('form', { name: 'Edit taxon' });
    fireEvent.change(within(form).getByLabelText('In-house code'), { target: { value: 'a1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('three capital letters');

    api.updateOrgTaxon.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
    fireEvent.change(within(form).getByLabelText('In-house code'), { target: { value: 'pro' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Another taxon already uses this code.',
    );

    fireEvent.change(within(form).getByLabelText('In-house code'), { target: { value: 'alo' } });
    fireEvent.change(within(form).getByLabelText('IUCN category'), { target: { value: 'LC' } });
    fireEvent.change(within(form).getByLabelText('Common names, Arabic'), {
      target: { value: 'صبار، الألوة' },
    });
    fireEvent.click(within(form).getByLabelText('EG'));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateOrgTaxon).toHaveBeenLastCalledWith(
        'o1',
        'aloe',
        expect.objectContaining({
          inhouse_code: 'ALO',
          iucn_category: 'LC',
          zones_present: ['EG', 'SG'],
          attributes: { life_forms: ['Succulent'], common_names: { ar: ['صبار', 'الألوة'] } },
        }),
      ),
    );
  });

  it('shows the change history to curators', async () => {
    renderAt('/taxa/aloe', ['curator']);
    const h = await screen.findByTestId('taxon-history');
    await waitFor(() => expect(within(h).getByText('IUCN category: EN to VU')).toBeInTheDocument());
    expect(within(h).getByText(/Terra Curator/)).toBeInTheDocument();
  });

  it('other roles get no edit, no approve, and no history', async () => {
    renderAt('/taxa/aloe', ['green_team']);
    expect(await screen.findByText(/Proposed in-house code/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit (curator)' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('taxon-history')).not.toBeInTheDocument();
    expect(api.fetchTaxonHistory).not.toHaveBeenCalled();
  });
});
