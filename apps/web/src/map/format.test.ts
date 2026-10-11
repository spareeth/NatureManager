import { describe, expect, it } from 'vitest';
import { formatGrid, formatLatLon } from './format';

describe('coordinate formatting', () => {
  it('shows lat/lon to 6 decimals with hemispheres', () => {
    expect(formatLatLon(24.958751234, 55.154491234)).toBe('24.958751° N, 55.154491° E');
    expect(formatLatLon(-1.5, -0.25)).toBe('1.500000° S, 0.250000° W');
  });
  it('shows site grid to centimetres', () => {
    expect(formatGrid(131.714, 97.6)).toBe('x 131.71 m, y 97.60 m');
  });
});
