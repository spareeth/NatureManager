import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import { OrgContext, type OrgState } from '../org/context';
import type { Membership } from '../org/pickOrg';
import type { Role } from '../auth/roles';
import { App } from '../app/App';

export function membership(roles: Role[], id = 'org-t', name = 'Terra'): Membership {
  return {
    organisationId: id,
    organisationName: name,
    organisationSlug: id,
    roles,
    displayName: 'Test User',
  };
}

export function renderApp(opts: {
  path?: string;
  session?: boolean;
  memberships?: Membership[];
  auth?: Partial<AuthState>;
  org?: Partial<OrgState>;
}) {
  const memberships = opts.memberships ?? [];
  const auth: AuthState = {
    session:
      opts.session === false ? null : ({ user: { id: 'u1', email: 'u@terra.test' } } as Session),
    loading: false,
    signInWithEmail: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {}),
    ...opts.auth,
  };
  const org: OrgState = {
    memberships,
    current: memberships[0] ?? null,
    loading: false,
    error: null,
    switchOrg: vi.fn(),
    ...opts.org,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <OrgContext.Provider value={org}>
          <MemoryRouter initialEntries={[opts.path ?? '/']}>
            <App />
          </MemoryRouter>
        </OrgContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { auth, org };
}
