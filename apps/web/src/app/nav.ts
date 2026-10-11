import type { Role } from '../auth/roles';

export type NavItem = {
  path: string;
  labelKey: string;
  /** Roles that see the item; omitted means every member. */
  roles?: Role[];
};

// Grows phase by phase; each item's roles follow docs/SRS.md section 2.
export const NAV: NavItem[] = [
  { path: '/', labelKey: 'nav.map' },
  {
    path: '/field',
    labelKey: 'nav.field',
    roles: ['manager', 'field_manager', 'curator', 'green_team', 'field_engineer'],
  },
  { path: '/members', labelKey: 'nav.members', roles: ['manager', 'field_manager'] },
];

export function canSee(item: Pick<NavItem, 'roles'>, roles: readonly Role[]): boolean {
  return !item.roles || item.roles.some((r) => roles.includes(r));
}

export function visibleNav(roles: readonly Role[], items: NavItem[] = NAV): NavItem[] {
  return items.filter((i) => canSee(i, roles));
}
