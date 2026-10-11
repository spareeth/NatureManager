import { describe, expect, it } from 'vitest';
import { fromDistanceBearing, normaliseBearing, parseNumber, toDistanceBearing } from './offset';

describe('offset arithmetic on the grid', () => {
  it('parses numbers people type', () => {
    expect(parseNumber('2,5')).toBe(2.5);
    expect(parseNumber(' -1.25 ')).toBe(-1.25);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('3 m')).toBeNull();
  });
  it('normalises bearings', () => {
    expect(normaliseBearing(370)).toBe(10);
    expect(normaliseBearing(-90)).toBe(270);
  });
  it('bearing is clockwise from grid north', () => {
    expect(fromDistanceBearing(10, 0)).toEqual({ dx: 0, dy: 10 });
    expect(fromDistanceBearing(10, 90)).toEqual({ dx: 10, dy: 0 });
    expect(fromDistanceBearing(10, 180)).toEqual({ dx: 0, dy: -10 });
    expect(fromDistanceBearing(10, 270)).toEqual({ dx: -10, dy: 0 });
    expect(fromDistanceBearing(5, 36.87)).toEqual({ dx: 3, dy: 4 });
  });
  it('converts back', () => {
    expect(toDistanceBearing({ dx: 3, dy: 4 })).toEqual({ distance: 5, bearing: 36.9 });
    expect(toDistanceBearing({ dx: -3, dy: -4 })).toEqual({ distance: 5, bearing: 216.9 });
  });
});
