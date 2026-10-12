import { describe, expect, it } from 'vitest';
import {
  addDays,
  byDay,
  dubaiDate,
  dubaiInstant,
  moveToDay,
  weekStart,
  type BoardItem,
} from './model';

describe('Dubai calendar helpers', () => {
  it('dates follow Dubai time (UTC+4)', () => {
    expect(dubaiDate('2026-10-12T19:59:00Z')).toBe('2026-10-12');
    expect(dubaiDate('2026-10-12T20:01:00Z')).toBe('2026-10-13');
  });
  it('weeks start on Monday', () => {
    expect(weekStart('2026-10-15')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Sunday
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
  it('day arithmetic crosses months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('07:00 in Dubai is 03:00 UTC', () => {
    expect(dubaiInstant('2026-10-12')).toBe('2026-10-12T03:00:00.000Z');
  });
  it('moving keeps the Dubai time of day', () => {
    expect(moveToDay('2026-10-12T05:30:00.000Z', '2026-10-15')).toBe('2026-10-15T05:30:00.000Z');
  });
  it('groups by planned day', () => {
    const it0 = { planned_start: '2026-10-12T03:00:00Z' } as BoardItem;
    const it1 = { planned_start: '2026-10-12T21:00:00Z' } as BoardItem;
    const it2 = { planned_start: null } as BoardItem;
    expect(
      Object.fromEntries(Object.entries(byDay([it0, it1, it2])).map(([k, v]) => [k, v.length])),
    ).toEqual({ '2026-10-12': 1, '2026-10-13': 1 });
  });
});
