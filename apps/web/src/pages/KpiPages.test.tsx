import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { BiodiversityPage } from './BiodiversityPage';
import { WaterPage } from './WaterPage';

vi.mock('../kpi/BedMap', () => ({
  BedMap: ({
    layers,
    defaultOn,
    pointLayers,
  }: {
    layers: { key: string; help?: string; values: Record<string, { label: string }> }[];
    defaultOn: string[];
    pointLayers?: { points: unknown[] }[];
  }) => (
    <div data-testid="bedmap">
      {layers.map((l) => `${l.key}:${Object.keys(l.values).join('+')}`).join(',')} on=
      {defaultOn.join(',')} points={(pointLayers ?? []).reduce((n, p) => n + p.points.length, 0)}
    </div>
  ),
}));
vi.mock('../org/useSite', () => ({ useCurrentSite: () => ({ site: { id: 's1' } }) }));
vi.mock('../kpi/api', async (orig) => ({
  ...(await orig<typeof import('../kpi/api')>()),
  fetchBio: async () => ({
    parameters: {
      'biodiversity.native_pattern': {
        value: 'Arabian',
        unit: 'regex',
        source: 'Kit 01',
        verified: false,
      },
    },
    garden: {
      gamma_s: 76,
      plants: 657,
      beds: 48,
      beds_with_plants: 48,
      mean_s: 7.6,
      sd_s: 4.4,
      mean_shannon: 1.64,
      mean_evenness: 0.83,
      shannon: 3.3367,
      native_species: 17,
      pct_native_species: 22.4,
      pct_native_plants: 55.7,
      threatened_species: 1,
      mean_sorensen: 0.7368,
    },
    zones: [
      {
        zone: 'EG',
        n_beds: 12,
        total_s: 40,
        total_n: 150,
        mean_s: 6,
        sd_s: 3,
        mean_h: 1.5,
        mean_j: 0.8,
        gamma_s: 30,
      },
    ],
    beds: [
      {
        bed: 'EG-01',
        zone: 'EG',
        area_m2: 423.8,
        s: 1,
        n: 1,
        shannon: 0,
        simpson: 0,
        inv_simpson: 1,
        evenness: 0,
        margalef: 0,
        hill_q0: 1,
        hill_q1: 1,
        hill_q2: 1,
        species_density_ha: 23.6,
        pct_native_species: 0,
        pct_native_plants: 0,
        s_threatened: 0,
        mean_bray: 0.98,
        mean_sorensen: 0.98,
        mean_turnover: 0.98,
        mean_nestedness: 0,
      },
    ],
  }),
  fetchWater: async () => ({
    parameters: {
      'water.flat_rate_l_m2_day': { value: 6, unit: 'L/m2/day', source: 'Kit 06', verified: false },
    },
    garden: {
      area_m2: 6276,
      beds: 48,
      mean_kc: 0.501,
      demand_m3_yr: 9119.6,
      current_m3_yr: 13743,
      saving_m3_yr: 4623.4,
      saving_pct: 33.6,
      saving_aed_yr: 17708,
      beds_under: 26,
      metered_beds: 0,
    },
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      eto: 5,
      demand_m3_day: 20 + i,
      current_m3_day: 37.65,
    })),
    beds: [
      {
        bed: 'EG-01',
        zone: 'EG',
        area_m2: 423.8,
        kc: 0.35,
        n_plants: 1,
        dominant_life_form: 'Geophyte',
        pct_succulent: 0,
        demand_l_day_by_month: Array(12).fill(1000),
        demand_m3_yr: 449.19,
        current_m3_yr: 928.02,
        saving_pct: 51.6,
        months_under: 0,
        peak_demand_l_day: 1944.6,
        peak_month: 7,
        demand_l_m2_yr: 1060,
        meters: 0,
        metered_m3_yr: null,
      },
    ],
  }),
  fetchAnalytics: async () => ({
    richness: {
      EG: {
        n: 154,
        s_obs: 31,
        singletons: 6,
        doubletons: 4,
        chao1: 35.5,
        coverage: 0.96,
        curve: [
          { m: 1, s: 1, extrapolated: false },
          { m: 154, s: 31, extrapolated: false },
          { m: 308, s: 34, extrapolated: true },
        ],
      },
      all: {
        n: 657,
        s_obs: 76,
        singletons: 24,
        doubletons: 13,
        chao1: 98.1,
        coverage: 0.9635,
        curve: [
          { m: 1, s: 1, extrapolated: false },
          { m: 657, s: 76, extrapolated: false },
          { m: 1314, s: 90.6, extrapolated: true },
        ],
      },
    },
    moran: {
      richness: {
        i: 0.0824,
        p: 0.04,
        expected: -0.14,
        beds: 48,
        with_neighbours: 8,
        permutations: 999,
      },
      shannon: {
        i: 0.2333,
        p: 0.004,
        expected: -0.14,
        beds: 48,
        with_neighbours: 8,
        permutations: 999,
      },
    },
    carbon: {
      beds: [
        {
          bed: 'EG-01',
          zone: 'EG',
          biomass_t: 0.1,
          carbon_t: 0.05,
          carbon_ci95_t: 0.01,
          co2e_t: 0.18,
          carbon_t_ha: 1.2,
        },
      ],
      totals: {
        all: {
          biomass_t: 18.47,
          carbon_t: 8.68,
          carbon_ci95_t: 0.31,
          co2e_t: 31.83,
          carbon_t_ha: 13.83,
        },
      },
    },
  }),
  fetchCommunity: async () => ({ 'EG-01': { A: 1 }, 'EG-02': { A: 1, B: 2 }, 'NG-01': { C: 3 } }),
  fetchAnalysis: async () => ({
    code: 'tree_loss_2025_2026',
    title: 'Isolated trees lost',
    period_from: '2025-12-28',
    period_to: '2026-10-10',
    method: 'Visible bands only.',
    summary: {
      mature: {
        isolated: 872,
        lost: 57,
        lost_low: 44,
        lost_by_apr: 39,
        lost_apr_to_oct: 18,
        still_there: 181,
        unclear: 620,
        flicker_rate: 0.072,
        lost_crown_m2: 2352,
      },
      small: {
        isolated: 1280,
        lost: 169,
        lost_low: 100,
        lost_by_apr: 102,
        lost_apr_to_oct: 67,
        still_there: 519,
        unclear: 512,
        flicker_rate: 0.13,
        lost_crown_m2: 1514,
      },
      mature_min_crown_m2: 20,
      vegetated_ha: { dec2025: 46.7, apr2026: 45.5, oct2026: 41.4 },
    },
    features: {
      features: [
        {
          geometry: { coordinates: [55.15, 24.96] },
          properties: { crown_m2: 25, when: 'lost by Apr 2026' },
        },
      ],
    },
  }),
  fetchOverlays: async () => [],
  fetchHistory: async () => [],
}));

function renderIt(el: React.ReactNode, roles: string[] = ['curator']) {
  const org = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 't',
      roles,
      displayName: 'C',
    },
  } as unknown as OrgState;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>{el}</OrgContext.Provider>
    </QueryClientProvider>,
  );
}

describe('Biodiversity page', () => {
  it('headline figures, the bed map and the unverified parameter', async () => {
    renderIt(<BiodiversityPage />);
    const tiles = await screen.findByTestId('bio-tiles');
    expect(within(tiles).getByText('76')).toBeInTheDocument();
    expect(within(tiles).getByText('7.6 ± 4.4')).toBeInTheDocument();
    expect(within(tiles).getByText('22.4%')).toBeInTheDocument();
    expect(screen.getByTestId('bedmap')).toHaveTextContent('s:EG-01');
    expect(screen.getByTestId('bedmap')).toHaveTextContent('shannon:EG-01');
    expect(screen.getByTestId('bedmap')).toHaveTextContent('on=s');
    expect(
      within(screen.getByTestId('glossary')).getByText('Evenness (Pielou J)'),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId('params')).getByText('Unverified')).toBeInTheDocument();
    expect((await screen.findAllByText('98.1')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('richness-curve')).toBeInTheDocument();
    expect(within(screen.getByTestId('moran')).getByText('I = 0.0824')).toBeInTheDocument();
    expect(within(screen.getByTestId('carbon')).getByText('8.68 ± 0.31 t')).toBeInTheDocument();
    expect(await screen.findByTestId('ordination')).toBeInTheDocument();
    const trees = await screen.findByTestId('tree-loss');
    expect(within(trees).getAllByText('44 to 57').length).toBeGreaterThan(0);
    expect(within(trees).getByText('39 / 18')).toBeInTheDocument();
    expect(screen.getByTestId('bedmap')).toHaveTextContent('points=1');
    expect(
      within(screen.getByTestId('params')).getByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
  });
});

describe('Water page', () => {
  it('demand against the flat rate, no meters yet, monthly chart', async () => {
    renderIt(<WaterPage />, ['green_team']);
    const tiles = await screen.findByTestId('water-tiles');
    expect(within(tiles).getByText('33.6%')).toBeInTheDocument();
    expect(within(tiles).getByText('0 / 48')).toBeInTheDocument();
    expect(within(tiles).getByText(/No flow meters yet/)).toBeInTheDocument();
    expect(screen.getByTestId('monthly-chart')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('params')).queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });
});
