import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import { AuthContext } from '../auth/context';
import { ObserveScreen } from './ObserveScreen';

const obs = vi.hoisted(() => ({
  queueObservation: vi.fn(),
  fetchMyObservations: vi.fn(),
  fetchPlaces: vi.fn(),
  identifySpecies: vi.fn(),
}));
vi.mock('./observe', async (orig) => ({ ...(await orig<typeof import('./observe')>()), ...obs }));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

function setGps(ok: boolean) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (yes: PositionCallback, no: PositionErrorCallback) =>
        ok
          ? yes({
              coords: { latitude: 24.9588, longitude: 55.1545, accuracy: 4.4 },
            } as GeolocationPosition)
          : no({ code: 1 } as GeolocationPositionError),
    },
  });
}

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
      roles: ['green_team'],
      displayName: 'G',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider
        value={
          {
            session: { user: { id: 'u1' } } as never,
            loading: false,
            signInWithEmail: vi.fn(),
            signOut: vi.fn(),
          } as never
        }
      >
        <OrgContext.Provider value={org}>
          <MemoryRouter initialEntries={['/field/observe']}>
            <Routes>
              <Route path="/field/observe" element={<ObserveScreen />} />
            </Routes>
          </MemoryRouter>
        </OrgContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  obs.fetchMyObservations.mockResolvedValue([]);
  obs.fetchPlaces.mockResolvedValue([{ id: 'l1', code: 'NG-02', lon: 55.15, lat: 24.95 }]);
  obs.queueObservation.mockResolvedValue('id1');
});

describe('new observation', () => {
  it('three taps: a type, then Save, with the GPS point', async () => {
    setGps(true);
    renderIt();
    expect(await screen.findByText('Location found (within 4 m).')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Animal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));
    await waitFor(() =>
      expect(obs.queueObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          obsType: 'fauna',
          lat: 24.9588,
          lon: 55.1545,
          accuracy: 4,
          count: 2,
          locationId: null,
        }),
        [],
        null,
      ),
    );
    expect(await screen.findByText(/Observation saved/)).toBeInTheDocument();
  });

  it('without GPS the bed is chosen; phenology needs a stage', async () => {
    setGps(false);
    renderIt();
    expect(await screen.findByText('No GPS. Choose the bed or zone below.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Phenology/ }));
    const save = screen.getByRole('button', { name: 'Save observation' });
    expect(save).toBeDisabled();
    fireEvent.change(await screen.findByLabelText('Bed or zone'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Flowering' }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(obs.queueObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          obsType: 'phenology',
          phenophase: 'flowering',
          locationId: 'l1',
          accuracy: null,
        }),
        [],
        null,
      ),
    );
  });

  it('photo, Identify species, pick a suggestion: saved with the taxon and the suggestions', async () => {
    setGps(true);
    const suggestions = [
      {
        rank: 1,
        scientific_name: 'Prosopis cineraria',
        score: 0.97,
        engine: 'bioclip2',
        taxon_id: 't-ghaf',
        inhouse_code: 'PRO',
        in_collection: true,
        iucn_category: 'LC',
        sensitive: false,
        common_name: 'Ghaf',
      },
      {
        rank: 2,
        scientific_name: 'Acacia tortilis',
        score: 0.02,
        engine: 'plantnet',
        taxon_id: null,
        inhouse_code: null,
        in_collection: false,
        iucn_category: null,
        sensitive: false,
        common_name: null,
      },
    ];
    obs.identifySpecies.mockResolvedValue({
      engine_chain: ['bioclip2'],
      suggestions,
      warnings: [],
    });
    renderIt();
    await screen.findByText('Location found (within 4 m).');
    fireEvent.click(screen.getByRole('button', { name: /^PlantA plant/ }));
    const photo = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Take photo'), { target: { files: [photo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Identify species' }));
    const ghaf = await screen.findByRole('radio', { name: /Prosopis cineraria/ });
    expect(screen.getByText('In this bed')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Acacia tortilis/ })).toBeDisabled();
    expect(obs.identifySpecies).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', kind: 'plant', lat: 24.9588, lon: 55.1545 }),
    );
    fireEvent.click(ghaf);
    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));
    await waitFor(() =>
      expect(obs.queueObservation).toHaveBeenCalledWith(
        expect.objectContaining({ obsType: 'flora', taxonId: 't-ghaf', suggestions }),
        [photo],
        null,
      ),
    );
  });

  it('offline: Identify is not offered, the observation still saves', async () => {
    setGps(true);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    renderIt();
    await screen.findByText('Location found (within 4 m).');
    fireEvent.click(screen.getByRole('button', { name: /^Plant health/ }));
    fireEvent.change(screen.getByLabelText('Take photo'), {
      target: { files: [new File(['x'], 'p.jpg', { type: 'image/jpeg' })] },
    });
    expect(screen.getByRole('button', { name: 'Identify species' })).toBeDisabled();
    expect(screen.getByText(/Identify needs network/)).toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('Also create a work order: queued with the observation', async () => {
    setGps(true);
    renderIt();
    await screen.findByText('Location found (within 4 m).');
    fireEvent.click(screen.getByRole('button', { name: /^Pest or disease/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Severity 4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Also create a work order/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));
    await waitFor(() =>
      expect(obs.queueObservation).toHaveBeenCalledWith(
        expect.objectContaining({ obsType: 'pest_disease', severity: 4, createWorkOrder: true }),
        [],
        null,
      ),
    );
  });

  it('phenology does not offer a work order', async () => {
    setGps(true);
    renderIt();
    await screen.findByText('Location found (within 4 m).');
    fireEvent.click(screen.getByRole('button', { name: /^Phenology/ }));
    expect(
      screen.queryByRole('checkbox', { name: /Also create a work order/ }),
    ).not.toBeInTheDocument();
  });
});
