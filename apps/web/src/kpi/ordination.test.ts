import { describe, expect, it } from 'vitest';
import { brayCurtis, pcoa, symmetricEigen } from './ordination';

describe('ordination', () => {
  it('Bray-Curtis as vegan', () => {
    expect(brayCurtis({ a: 2, b: 1 }, { a: 1, c: 3 })).toBeCloseTo((1 + 1 + 3) / 7, 10);
    expect(brayCurtis({ a: 1 }, { a: 1 })).toBe(0);
  });
  it('eigen decomposition of a symmetric matrix', () => {
    const { values, vectors } = symmetricEigen([
      [2, 1],
      [1, 2],
    ]);
    expect(values[0]).toBeCloseTo(3, 8);
    expect(values[1]).toBeCloseTo(1, 8);
    expect(Math.abs(vectors[0]![0]!)).toBeCloseTo(Math.SQRT1_2, 8);
  });
  it('PCoA keeps the distances of points that lie on a line', () => {
    // three beds whose Bray-Curtis distances are 0.5, 0.5 and 1 (b halfway between a and c)
    const o = pcoa({ a: { x: 1 }, b: { x: 1, y: 1 }, c: { y: 1 } })!;
    const p = Object.fromEntries(o.points.map((q) => [q.bed, q]));
    const dist = (u: string, v: string) => Math.hypot(p[u]!.x - p[v]!.x, p[u]!.y - p[v]!.y);
    expect(dist('a', 'c')).toBeCloseTo(1, 6);
    expect(dist('a', 'b')).toBeCloseTo(0.5, 6);
    expect(o.explained[0]).toBeCloseTo(1, 6);
  });
});
