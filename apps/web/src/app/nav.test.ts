import { describe, expect, it } from 'vitest';
import { phoneTabs, visibleNav } from './nav';

const paths = (roles: Parameters<typeof visibleNav>[0]) => visibleNav(roles).map((i) => i.path);

describe('role-aware nav', () => {
  it('owner is read-only: map and assets', () => {
    expect(paths(['owner'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/requests',
      '/biodiversity',
      '/water',
    ]);
  });
  it('green team and field engineers get the field app, not members', () => {
    expect(paths(['green_team'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/field',
      '/requests',
      '/biodiversity',
      '/water',
    ]);
    expect(paths(['field_engineer'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/field',
      '/requests',
      '/biodiversity',
      '/water',
    ]);
  });
  it('managers and field managers see members', () => {
    expect(paths(['manager'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/field',
      '/requests',
      '/biodiversity',
      '/water',
      '/observations',
      '/plan',
      '/control-points',
      '/basemaps',
      '/members',
    ]);
    expect(paths(['field_manager'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/field',
      '/requests',
      '/biodiversity',
      '/water',
      '/plan',
      '/control-points',
      '/members',
    ]);
  });
  it('several roles combine', () => {
    expect(paths(['owner', 'curator'])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/field',
      '/requests',
      '/biodiversity',
      '/water',
      '/observations',
    ]);
  });
  it('no roles still sees items open to every member', () => {
    expect(paths([])).toEqual([
      '/',
      '/assets',
      '/taxa',
      '/work',
      '/requests',
      '/biodiversity',
      '/water',
    ]);
  });
});

describe('phone tabs', () => {
  const paths = (roles: Parameters<typeof visibleNav>[0]) => {
    const { tabs, more } = phoneTabs(visibleNav(roles));
    return [tabs.map((i) => i.path), more.map((i) => i.path)];
  };
  it('field roles: Map, Field app, Work orders; the rest under More', () => {
    expect(paths(['green_team'])).toEqual([
      ['/', '/field', '/work'],
      ['/assets', '/taxa', '/requests', '/biodiversity', '/water'],
    ]);
  });
  it('owner (no field app): Map, Work orders', () => {
    expect(paths(['owner'])[0]).toEqual(['/', '/work']);
  });
});
