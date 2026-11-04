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
});
