import { createContext, useContext } from 'react';
import type { Membership } from './pickOrg';

export type OrgState = {
  memberships: Membership[];
  current: Membership | null;
  loading: boolean;
  error: string | null;
  switchOrg: (organisationId: string) => void;
};

export const OrgContext = createContext<OrgState | null>(null);

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}
