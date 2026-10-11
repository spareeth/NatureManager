import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { describeEvent, type TimelineEvent } from './timeline';

const ev = (kind: TimelineEvent['kind'], data: Record<string, unknown>): TimelineEvent => ({
  at: '2026-10-01T04:00:00Z',
  kind,
  by: 'Green One',
  data,
});
const t = i18n.t.bind(i18n);

describe('describeEvent', () => {
  it('describes every kind', () => {
    expect(describeEvent(ev('created', {}), t)).toBe('Record created');
    expect(
      describeEvent(
        ev('status', { from: 'established', to: 'declining', reason: 'Leaf scorch' }),
        t,
      ),
    ).toBe('Status changed from Established to Declining: Leaf scorch');
    expect(
      describeEvent(ev('status', { from: 'planted', to: 'established', reason: null }), t),
    ).toBe('Status changed from Planted to Established');
    expect(describeEvent(ev('condition', { from: 4, to: 3 }), t)).toBe(
      'Condition changed from 4 to 3',
    );
    expect(
      describeEvent(
        ev('moved', {
          from: { x: 50, y: 50 },
          to: { x: 51.2, y: 50 },
          position_source: 'rtk',
          accuracy_m: 0.02,
        }),
        t,
      ),
    ).toBe('Moved from 50.00, 50.00 to 51.20, 50.00 (RTK survey, ±0.02 m)');
    expect(describeEvent(ev('edited', { fields: ['name', 'install_date'] }), t)).toBe(
      'Edited: name, planting date',
    );
    expect(describeEvent(ev('photo', { caption: 'Canopy' }), t)).toBe('Photo added: Canopy');
  });

  it('works in Arabic', async () => {
    await i18n.changeLanguage('ar');
    expect(describeEvent(ev('condition', { from: 4, to: 3 }), t)).toBe(
      'تغيرت الحالة الصحية من 4 إلى 3',
    );
    await i18n.changeLanguage('en');
  });
});
