import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { AuthProvider } from './AuthProvider';
import { useAuth, type AuthState } from './context';

const signInWithOtp = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOtp: (...a: unknown[]) => signInWithOtp(...a),
      signOut: async () => ({}),
    },
  },
}));

function capture(): Promise<AuthState> {
  return new Promise((resolve) => {
    function Probe() {
      const auth = useAuth();
      useEffect(() => resolve(auth), [auth]);
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

describe('signInWithEmail', () => {
  it('does not create users and redirects back to the app', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: null });
    const auth = await capture();
    await auth.signInWithEmail('green1@terra.test');
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'green1@terra.test',
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + '/' },
    });
  });

  it('hides whether an address has an account', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'Signups not allowed for otp' } });
    const auth = await capture();
    await waitFor(async () =>
      expect(await auth.signInWithEmail('x@example.com')).toEqual({ error: null }),
    );
  });

  it('passes other errors through', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } });
    const auth = await capture();
    expect(await auth.signInWithEmail('x@terra.test')).toEqual({
      error: 'Email rate limit exceeded',
    });
  });
});
