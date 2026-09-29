import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/context';
import { asRoles } from '../auth/roles';
import { OrgContext, type OrgState } from './context';
import { pickOrg, type Membership } from './pickOrg';

const STORAGE_KEY = 'tg.currentOrg';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable (private mode); the choice lasts for this session only
  }
}

async function fetchMemberships(userId: string): Promise<Membership[]> {
  // RLS returns only organisations the user belongs to; filter to the user's own rows.
  const { data, error } = await supabase
    .from('membership')
    .select('roles, display_name, organisation:organisation_id (id, name, slug)')
    .eq('user_id', userId)
    .eq('active', true);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((m) =>
    m.organisation
      ? [
          {
            organisationId: m.organisation.id,
            organisationName: m.organisation.name,
            organisationSlug: m.organisation.slug,
            roles: asRoles(m.roles),
            displayName: m.display_name,
          },
        ]
      : [],
  );
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [storedId, setStoredId] = useState<string | null>(readStored);

  const query = useQuery({
    queryKey: ['memberships', userId],
    queryFn: () => fetchMemberships(userId!),
    enabled: !!userId,
  });

  const value = useMemo<OrgState>(() => {
    const memberships = query.data ?? [];
    return {
      memberships,
      current: pickOrg(memberships, storedId),
      loading: query.isPending && !!userId,
      error: query.error?.message ?? null,
      switchOrg(id) {
        writeStored(id);
        setStoredId(id);
        // Organisation-scoped data must not survive a switch.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'memberships' });
      },
    };
  }, [query.data, query.isPending, query.error, storedId, userId, queryClient]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
