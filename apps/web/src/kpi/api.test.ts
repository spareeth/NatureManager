import { describe, expect, it } from 'vitest';
import { classOf, quantileBreaks } from './api';

describe('choropleth classes', () => {
  it('quantile breaks split the values into classes', () => {
    const b = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(b).toEqual([3, 5, 7, 9]);
    expect(classOf(1, b)).toBe(0);
    expect(classOf(10, b)).toBe(4);
  });
  it('equal values collapse; no values give no breaks', () => {
    expect(quantileBreaks([2, 2, 2, 2])).toEqual([2]);
    expect(quantileBreaks([])).toEqual([]);
  });
});
