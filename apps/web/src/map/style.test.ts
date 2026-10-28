import { describe, expect, it } from 'vitest';
import { FALLBACK_COLOUR, legendZones, statusColour, zoneColour } from './style';

describe('map style', () => {
  it('colours the four Terra Garden zones distinctly', () => {
    const colours = ['EG', 'NG', 'SG', 'WG'].map(zoneColour);
    expect(new Set(colours).size).toBe(4);
    expect(colours).not.toContain(FALLBACK_COLOUR);
  });
  it('falls back to grey for unknown zones and statuses', () => {
    expect(zoneColour('XX')).toBe(FALLBACK_COLOUR);
    expect(zoneColour(null)).toBe(FALLBACK_COLOUR);
    expect(statusColour('nope')).toBe(FALLBACK_COLOUR);
  });
  it('legend lists each zone once, sorted', () => {
    expect(legendZones(['WG', 'EG', 'WG', 'NG']).map((z) => z.code)).toEqual(['EG', 'NG', 'WG']);
  });
});
