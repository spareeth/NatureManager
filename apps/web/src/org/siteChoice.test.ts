import { describe, expect, it } from 'vitest';
import { getSiteChoice, pickSite, setSiteChoice, UPCOMING_SITES } from './siteChoice';

const SITES = [
  { id: 'tg', code: 'TG' },
  { id: 'ev', code: 'EV' },
];

describe('project choice', () => {
  it('shows the chosen site, else the first', () => {
    expect(pickSite(SITES, 'ev')?.id).toBe('ev');
    expect(pickSite(SITES, null)?.id).toBe('tg');
    expect(pickSite(SITES, 'gone')?.id).toBe('tg');
    expect(pickSite(undefined, 'ev')).toBeUndefined();
  });
  it('remembers the choice per organisation', () => {
    setSiteChoice('o1', 'ev');
    expect(getSiteChoice('o1')).toBe('ev');
    expect(getSiteChoice('o2')).toBeNull();
  });
  it('Expo Valley is announced, not set up', () => {
    expect(UPCOMING_SITES.map((s) => s.name)).toEqual(['Expo Valley']);
  });
});
