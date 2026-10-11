import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthContext, type AuthState } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      async signInWithEmail(email) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          // Only existing staff sign in; accounts are created by a manager or the seed.
          // Return to the page the user opened (for example a scanned /a/<tag> link).
          options: { shouldCreateUser: false, emailRedirectTo: window.location.href },
        });
        // Unknown addresses get the same answer as staff accounts, so the form does not
        // reveal who has an account.
        if (error && !/signups not allowed/i.test(error.message)) return { error: error.message };
        return { error: null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
