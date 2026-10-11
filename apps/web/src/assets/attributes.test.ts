import { describe, expect, it } from 'vitest';
import { attributeRows } from './attributes';

describe('attributeRows', () => {
  const schema = {
    type: 'object',
    properties: {
      height_m: { type: 'number', title: 'Height (m)' },
      multi_stem: { type: 'boolean', title: 'Multi-stem' },
      dbh_cm: { type: 'number', title: 'DBH (cm)' },
    },
  };

  it('uses schema titles and order, skips empty values, then lists extra keys', () => {
    expect(
      attributeRows(
        { dbh_cm: 32, height_m: 6.5, multi_stem: false, hortis_note: 'from tag', empty: '' },
        schema,
      ),
    ).toEqual([
      { key: 'height_m', label: 'Height (m)', value: '6.5' },
      { key: 'multi_stem', label: 'Multi-stem', value: 'no' },
      { key: 'dbh_cm', label: 'DBH (cm)', value: '32' },
      { key: 'hortis_note', label: 'hortis_note', value: 'from tag' },
    ]);
  });

  it('copes with no schema or no attributes', () => {
    expect(attributeRows(null, schema)).toEqual([]);
    expect(attributeRows({ measures: ['flow', 'pressure'] }, null)).toEqual([
      { key: 'measures', label: 'measures', value: 'flow, pressure' },
    ]);
  });
});
