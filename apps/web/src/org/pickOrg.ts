import type { Role } from '../auth/roles';

export type Membership = {
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  roles: Role[];
  displayName: string;
};

/** Stored choice if the user still belongs to it, else the first organisation by name. */
export function pickOrg(memberships: Membership[], storedId: string | null): Membership | null {
  if (memberships.length === 0) return null;
  const stored = memberships.find((m) => m.organisationId === storedId);
  if (stored) return stored;
  return [...memberships].sort((a, b) => a.organisationName.localeCompare(b.organisationName))[0]!;
}
