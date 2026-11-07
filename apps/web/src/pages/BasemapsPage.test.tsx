import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { BasemapsPage } from './BasemapsPage';
import type { Basemap } from '../map/basemaps';

const api = vi.hoisted(() => ({
  fetchBasemaps: vi.fn(),
  saveBasemap: vi.fn(),
  setDefaultBasemap: vi.fn(),
  deleteBasemap: vi.fn(),
  KEYS: { google: 'k' } as { google?: string; esri?: string },
}));
vi.mock('../map/basemaps', async (orig) => ({
  ...(await orig<typeof import('../map/basemaps')>()),
  ...api,
}));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

const row = (over: Partial<Basemap>): Basemap => ({
  id: over.name!,
  site_id: 's1',
  name: 'x',
  kind: 'xyz',
  url: null,
  attribution: null,
  min_zoom: 0,
  max_zoom: 22,
  max_native_zoom: 19,
  offline_allowed: false,
  is_default: false,
  sort_order: 10,
  active: true,
  ...over,
});

function renderIt() {
  const org: OrgState = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 'terra',
      roles: ['manager'],
      displayName: 'M',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <BasemapsPage />
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchBasemaps.mockResolvedValue([
    row({
      name: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      offline_allowed: true,
    }),
    row({ name: 'Google satellite', kind: 'google', is_default: true, sort_order: 20 }),
    row({ name: 'Esri World Imagery', kind: 'esri', sort_order: 30 }),
  ]);
  api.saveBasemap.mockResolvedValue(undefined);
  api.setDefaultBasemap.mockResolvedValue(undefined);
});

describe('base maps page', () => {
  it('lists layers with offline rule, default, and a missing key', async () => {
    renderIt();
    expect(await screen.findByTestId('basemap-OpenStreetMap')).toHaveTextContent('Yes');
    expect(screen.getByTestId('basemap-Google satellite')).toHaveTextContent('Default');
    expect(screen.getByTestId('basemap-Esri World Imagery')).toHaveTextContent(
      'no API key: hidden',
    );
    expect(screen.getByTestId('basemap-Esri World Imagery')).toHaveTextContent('Online only');
  });

  it('makes another layer the default', async () => {
    renderIt();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Make default' }))[0]!);
    await waitFor(() => expect(api.setDefaultBasemap).toHaveBeenCalled());
  });

  it('adds our own orthophoto as an offline layer, checking the URL', async () => {
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Add base map' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Drone 2026' } });
    fireEvent.change(screen.getByLabelText('Tile URL'), {
      target: { value: 'https://tiles.example.org/tg.png' },
    });
    expect(screen.getByText('Use https:// and include {z}, {x} and {y}.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tile URL'), {
      target: { value: 'https://tiles.example.org/tg/{z}/{x}/{y}.webp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveBasemap).toHaveBeenCalledWith(
        'o1',
        's1',
        expect.objectContaining({
          name: 'Drone 2026',
          kind: 'xyz',
          url: 'https://tiles.example.org/tg/{z}/{x}/{y}.webp',
          offline_allowed: true,
        }),
      ),
    );
  });

  it('Google and Esri cannot be marked for offline use', async () => {
    renderIt();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]!);
    expect(screen.getByLabelText('May be stored on phones for offline use')).toBeDisabled();
  });
});
