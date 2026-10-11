import { describe, expect, it } from 'vitest';
import { distinctCorners, pointEWKT, polygonEWKT } from './geometry';

describe('geometry', () => {
  it('writes points as EWKT in lon lat order', () => {
    expect(pointEWKT([55.1544912345678, 24.958751])).toBe('SRID=4326;POINT(55.15449123 24.958751)');
  });
  it('closes polygon rings', () => {
    expect(
      polygonEWKT([
        [1, 1],
        [2, 1],
        [2, 2],
      ]),
    ).toBe('SRID=4326;POLYGON((1 1, 2 1, 2 2, 1 1))');
  });
  it('needs three distinct corners', () => {
    expect(
      distinctCorners([
        [1, 1],
        [1, 1],
        [2, 2],
      ]),
    ).toBe(2);
    expect(() =>
      polygonEWKT([
        [1, 1],
        [1, 1],
        [2, 2],
      ]),
    ).toThrow();
  });
});
