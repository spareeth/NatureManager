import { describe, expect, it } from 'vitest';
import { CODE_RE, EMPTY_TAXON_FILTERS, parseTaxonFilters, taxonParams } from './filters';

describe('taxon filters', () => {
  it('round-trips through the URL', () => {
    const f = {
      ...EMPTY_TAXON_FILTERS,
      q: 'ghaf',
      iucn: 'EN',
      zone: 'WG',
      code: 'proposed' as const,
      sort: 'plants' as const,
      desc: true,
      page: 2,
    };
    expect(parseTaxonFilters(taxonParams(f))).toEqual(f);
    expect(taxonParams(EMPTY_TAXON_FILTERS).toString()).toBe('');
  });
  it('ignores bad values', () => {
    expect(parseTaxonFilters(new URLSearchParams('code=maybe&sort=x&page=0'))).toEqual(
      EMPTY_TAXON_FILTERS,
    );
  });
  it('codes are three capital letters', () => {
    expect(['PRO', 'ALO'].every((c) => CODE_RE.test(c))).toBe(true);
    expect(['pro', 'PR', 'PROS', 'P1O'].some((c) => CODE_RE.test(c))).toBe(false);
  });
});
