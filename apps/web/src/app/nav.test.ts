import { describe, expect, it } from 'vitest';
import { visibleNav } from './nav';

const paths = (roles: Parameters<typeof visibleNav>[0]) => visibleNav(roles).map((i) => i.path);

describe('role-aware nav', () => {
  it('owner is read-only: map and assets', () => {
    expect(paths(['owner'])).toEqual(['/', '/assets']);
  });
  it('green team and field engineers get the field app, not members', () => {
    expect(paths(['green_team'])).toEqual(['/', '/assets', '/field']);
    expect(paths(['field_engineer'])).toEqual(['/', '/assets', '/field']);
  });
  it('managers and field managers see members', () => {
    expect(paths(['manager'])).toEqual(['/', '/assets', '/field', '/members']);
    expect(paths(['field_manager'])).toEqual(['/', '/assets', '/field', '/members']);
  });
  it('several roles combine', () => {
    expect(paths(['owner', 'curator'])).toEqual(['/', '/assets', '/field']);
  });
  it('no roles still sees items open to every member', () => {
    expect(paths([])).toEqual(['/', '/assets']);
  });
});
