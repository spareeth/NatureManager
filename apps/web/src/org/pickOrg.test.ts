import { describe, expect, it } from 'vitest';
import { pickOrg, type Membership } from './pickOrg';

const m = (id: string, name: string): Membership => ({
  organisationId: id,
  organisationName: name,
  organisationSlug: id,
  roles: ['manager'],
  displayName: 'x',
});

describe('pickOrg', () => {
  const terra = m('t', 'Terra');
  const demo = m('d', 'Demo');

  it('returns null with no memberships', () => {
    expect(pickOrg([], 't')).toBeNull();
  });
  it('keeps the stored organisation while the user is still a member', () => {
    expect(pickOrg([terra, demo], 't')).toBe(terra);
  });
  it('falls back to the first by name when the stored one is gone', () => {
    expect(pickOrg([terra, demo], 'gone')).toBe(demo);
    expect(pickOrg([terra, demo], null)).toBe(demo);
  });
});
