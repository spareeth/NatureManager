import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, pageCount, parseFilters, toggleSort, toParams } from './filters';

describe('asset list filters', () => {
  it('round-trips through the URL and leaves defaults out', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: 'ghaf',
      assetClass: 'living' as const,
      status: ['planted', 'declining'],
      location: 'WG',
      sort: 'condition' as const,
      desc: true,
      page: 3,
    };
    const p = toParams(f);
    expect(p.toString()).toBe(
      'q=ghaf&class=living&status=planted%2Cdeclining&location=WG&sort=condition&desc=1&page=3',
    );
    expect(parseFilters(p)).toEqual({ ...f, type: '' });
    expect(toParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('ignores invalid values', () => {
    expect(parseFilters(new URLSearchParams('class=alien&sort=drop_table&page=-2'))).toEqual(
      EMPTY_FILTERS,
    );
  });

  it('sort toggles direction on the same column and resets the page', () => {
    const a = toggleSort({ ...EMPTY_FILTERS, page: 4 }, 'tag_code');
    expect([a.sort, a.desc, a.page]).toEqual(['tag_code', true, 1]);
    const b = toggleSort(a, 'status');
    expect([b.sort, b.desc]).toEqual(['status', false]);
  });

  it('page count is at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
  });
});
