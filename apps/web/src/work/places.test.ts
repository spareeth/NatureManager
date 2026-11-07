import { describe, expect, it } from 'vitest';
import { bedsIn, groupByPlace, placeMatches, zoneOf } from './places';

describe('places', () => {
  it('zone of a bed or a zone code', () => {
    expect(zoneOf('NG-04')).toBe('NG');
    expect(zoneOf('EG')).toBe('EG');
    expect(zoneOf(null)).toBeNull();
  });
  it('filters by garden, bed, or no place', () => {
    expect(placeMatches('NG-04', { zone: 'NG', bed: '' })).toBe(true);
    expect(placeMatches('EG-01', { zone: 'NG', bed: '' })).toBe(false);
    expect(placeMatches('NG-04', { zone: 'NG', bed: 'NG-02' })).toBe(false);
    expect(placeMatches(null, { zone: 'none', bed: '' })).toBe(true);
    expect(placeMatches('SG-01', { zone: '', bed: '' })).toBe(true);
  });
  it('beds of a garden present in the list, and grouping with no place last', () => {
    expect(bedsIn(['NG-04', 'EG-01', 'NG-02', null, 'NG-04', 'NG'], 'NG')).toEqual([
      'NG',
      'NG-02',
      'NG-04',
    ]);
    expect(
      groupByPlace([{ c: 'NG-04' }, { c: null }, { c: 'EG-01' }, { c: 'NG-04' }], (x) => x.c).map(
        ([k, v]) => [k, v.length],
      ),
    ).toEqual([
      ['EG-01', 1],
      ['NG-04', 2],
      [null, 1],
    ]);
  });
});
