import { describe, expect, it } from 'vitest';
import { A4_24, labelSlots, pageCountFor, perPage } from './layout';

describe('A4 24-up label layout', () => {
  it('fits A4: 3 x 70 mm wide, 8 x 37 mm tall', () => {
    expect(perPage(A4_24)).toBe(24);
    expect(A4_24.columns * A4_24.labelWidth).toBeLessThanOrEqual(A4_24.pageWidth);
    expect(A4_24.marginTop + A4_24.rows * A4_24.labelHeight).toBeLessThanOrEqual(A4_24.pageHeight);
  });

  it('fills row by row and breaks pages after 24', () => {
    const s = labelSlots(26);
    expect(s[0]).toMatchObject({ page: 0, index: 0, x: 0 });
    expect(s[1]).toMatchObject({ page: 0, index: 1, x: 70 });
    expect(s[3]).toMatchObject({ page: 0, index: 3, x: 0, y: 37.5 });
    expect(s[23]).toMatchObject({ page: 0, index: 23, x: 140 });
    expect(s[24]).toMatchObject({ page: 1, index: 0 });
    expect(pageCountFor(26)).toBe(2);
  });

  it('starts on a part-used sheet', () => {
    const s = labelSlots(3, 23);
    expect(s.map((x) => [x.page, x.index])).toEqual([
      [0, 22],
      [0, 23],
      [1, 0],
    ]);
    expect(pageCountFor(2, 23)).toBe(1);
    expect(pageCountFor(3, 23)).toBe(2);
    expect(labelSlots(1, 99)[0]!.index).toBe(23);
    expect(labelSlots(1, 0)[0]!.index).toBe(0);
    expect(pageCountFor(0)).toBe(0);
  });
});
