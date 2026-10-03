import type { Role } from './roles';

/** Roles that create and edit assets (every role except the read-only owner; RLS enforces it too). */
export const ASSET_EDITORS: Role[] = [
  'manager',
  'field_manager',
  'curator',
  'green_team',
  'field_engineer',
];

export function canEditAssets(roles: readonly Role[]): boolean {
  return roles.some((r) => ASSET_EDITORS.includes(r));
}
