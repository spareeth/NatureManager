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
  { path: '/assets', labelKey: 'nav.assets' },
  { path: '/taxa', labelKey: 'nav.taxa' },
  { path: '/work', labelKey: 'nav.work' },
  {
    path: '/field',
    labelKey: 'nav.field',
    roles: ['manager', 'field_manager', 'curator', 'green_team', 'field_engineer'],
  },
  { path: '/requests', labelKey: 'nav.requests' },
  { path: '/observations', labelKey: 'nav.observations', roles: ['manager', 'curator'] },
  { path: '/plan', labelKey: 'nav.plan', roles: ['manager', 'field_manager'] },
  { path: '/control-points', labelKey: 'nav.controlPoints', roles: ['manager', 'field_manager'] },
  { path: '/basemaps', labelKey: 'nav.basemaps', roles: ['manager'] },
  { path: '/members', labelKey: 'nav.members', roles: ['manager', 'field_manager'] },
];

export function canSee(item: Pick<NavItem, 'roles'>, roles: readonly Role[]): boolean {
  return !item.roles || item.roles.some((r) => roles.includes(r));
}

export function visibleNav(roles: readonly Role[], items: NavItem[] = NAV): NavItem[] {
  return items.filter((i) => canSee(i, roles));
}

// Header tabs on every screen size: Map, Field app and Work orders (those the user may see);
// everything else goes under "More".
const MAIN_TABS = ['/', '/field', '/work'];

export function phoneTabs(items: NavItem[]): { tabs: NavItem[]; more: NavItem[] } {
  const tabs = MAIN_TABS.map((p) => items.find((i) => i.path === p)).filter(
    (i): i is NavItem => !!i,
  );
  return { tabs, more: items.filter((i) => !tabs.includes(i)) };
}
