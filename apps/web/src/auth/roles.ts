// Organisation roles (docs/SRS.md section 2). platform_admin is not a membership role.
export const ROLES = [
  'owner',
  'manager',
  'field_manager',
  'curator',
  'green_team',
  'field_engineer',
] as const;
export type Role = (typeof ROLES)[number];

export function asRoles(values: readonly string[]): Role[] {
  return values.filter((v): v is Role => (ROLES as readonly string[]).includes(v));
}
