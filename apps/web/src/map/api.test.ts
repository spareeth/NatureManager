import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { rowsToFeatures } from './api';

describe('rowsToFeatures', () => {
  it('turns compact map_assets rows into point features', () => {
    const fc = rowsToFeatures({
      columns: ['lon', 'lat', 'tag_code', 'status', 'asset_class'],
      truncated: false,
      rows: [[55.1544, 24.9587, 'WG07-T04_PRO', 'planted', 'living']],
    });
    expect(fc.features).toEqual([
      {
        type: 'Feature',
        id: 'WG07-T04_PRO',
        geometry: { type: 'Point', coordinates: [55.1544, 24.9587] },
        properties: { tag_code: 'WG07-T04_PRO', status: 'planted', asset_class: 'living' },
      },
    ]);
  });
});
