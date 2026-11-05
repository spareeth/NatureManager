import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { ObservationsPage } from './ObservationsPage';
import { needsSpecies, statusesFor } from '../observations/api';

const api = vi.hoisted(() => ({
  fetchReview: vi.fn(),
  verifyObservation: vi.fn(),
  rejectObservation: vi.fn(),
}));
vi.mock('../observations/api', async (orig) => ({
  ...(await orig<typeof import('../observations/api')>()),
  ...api,
}));
vi.mock('../work/api', () => ({
  fetchPeople: async () => ({
    members: [{ user_id: 'u1', name: 'Green One', roles: [], team_id: null }],
    teams: [],
  }),
}));
vi.mock('../work/Attachments', () => ({ MediaItem: () => <span data-testid="media" /> }));
vi.mock('../assets/editApi', () => ({
  searchTaxa: async () => [
    {
      id: 't-sidr',
      scientific_name: 'Ziziphus spina-christi',
      inhouse_code: 'ZIZ',
      common_names: { en: ['Sidr'] },
    },
  ],
}));
vi.mock('../org/useSite', () => ({ useCurrentSite: () => ({ site: { id: 's1' } }) }));

const row = (over = {}) => ({
  id: 'ob1',
  obs_type: 'flora',
  observed_at: '2026-11-04T08:00:00Z',
  observer: 'u1',
  verification: 'observer_confirmed',
  count: null,
  life_stage: null,
  phenophase: null,
  severity: null,
  notes: 'by the path',
  taxon_id: 't-ghaf',
  taxon: { scientific_name: 'Prosopis cineraria' },
  location: { code: 'NG-02' },
  asset: null,
  suggestions: [
    {
      id: 's1',
      rank: 1,
      engine: 'bioclip2',
      taxon_name: 'Prosopis cineraria',
      taxon_id: 't-ghaf',
      score: 0.97,
      in_collection: true,
    },
    {
      id: 's2',
      rank: 2,
      engine: 'plantnet',
      taxon_name: 'Acacia tortilis',
      taxon_id: null,
      score: 0.02,
      in_collection: false,
    },
  ],
  media: [{ id: 'm1', bucket: 'photos', path: 'x.jpg', kind: 'photo', caption: null }],
  ...over,
});

function renderIt() {
  const org = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 't',
      roles: ['curator'],
      displayName: 'C',
    },
  } as OrgState;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <ObservationsPage />
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.verifyObservation.mockResolvedValue(undefined);
  api.rejectObservation.mockResolvedValue(undefined);
});

describe('curator review queue', () => {
  it('filters', () => {
    expect(statusesFor('pending')).toEqual(['ai_suggested', 'observer_confirmed']);
    expect(statusesFor('all')).toBeNull();
    expect(needsSpecies('flora')).toBe(true);
    expect(needsSpecies('water_quality')).toBe(false);
  });

  it('shows the observation with its suggestions and verifies the chosen species', async () => {
    api.fetchReview.mockResolvedValue([row()]);
    renderIt();
    const card = await screen.findByTestId('obs-card');
    expect(api.fetchReview).toHaveBeenCalledWith('s1', 'pending');
    expect(within(card).getByText(/By Green One/)).toBeInTheDocument();
    expect(within(card).getByTestId('media')).toBeInTheDocument();
    expect(within(card).getByText('(Not in our species list)')).toBeInTheDocument();
    fireEvent.click(
      within(card).getAllByRole('button', { name: 'Verify as Prosopis cineraria' })[1]!,
    );
    await waitFor(() => expect(api.verifyObservation).toHaveBeenCalledWith('ob1', undefined));
  });

  it('changes the species, and rejects', async () => {
    api.fetchReview.mockResolvedValue([row()]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderIt();
    const card = await screen.findByTestId('obs-card');
    fireEvent.click(within(card).getByRole('button', { name: 'Change species' }));
    fireEvent.change(within(card).getByLabelText('Search taxa'), { target: { value: 'zizi' } });
    fireEvent.click(await within(card).findByRole('button', { name: /Ziziphus spina-christi/ }));
    await waitFor(() => expect(api.verifyObservation).toHaveBeenCalledWith('ob1', 't-sidr'));
    fireEvent.click(within(card).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(api.rejectObservation).toHaveBeenCalled());
  });

  it('a plant without a species cannot be verified until one is chosen', async () => {
    api.fetchReview.mockResolvedValue([row({ taxon_id: null, taxon: null, suggestions: [] })]);
    renderIt();
    const card = await screen.findByTestId('obs-card');
    expect(within(card).getByRole('button', { name: 'Verify' })).toBeDisabled();
  });
});
