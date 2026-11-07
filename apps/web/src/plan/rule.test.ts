import { describe, expect, it } from 'vitest';
import { describeRule, EMPTY_RULE, fromRule, ruleProblems, toRule } from './rule';

describe('PM rule builder', () => {
  it('builds the weekly bed-care rule from SIMULATION.md', () => {
    expect(toRule({ ...EMPTY_RULE, each: 'bed' })).toEqual({
      freq: 'weekly',
      byweekday: [0, 1, 2, 3, 4],
      each: 'bed',
    });
  });
  it('keeps only fields that apply, sorted and unique', () => {
    expect(
      toRule({
        ...EMPTY_RULE,
        freq: 'monthly',
        weekdays: [4, 0],
        monthdays: [15, 1, 15],
        interval: 3,
        seasonFrom: 10,
        seasonTo: 4,
      }),
    ).toEqual({
      freq: 'monthly',
      interval: 3,
      bymonthday: [1, 15],
      season: { from_month: 10, to_month: 4 },
    });
  });
  it('round-trips', () => {
    const r = { freq: 'daily' as const, interval: 2, byweekday: [0, 3], start: '2026-11-01' };
    expect(toRule(fromRule(r))).toEqual(r);
    expect(fromRule(null)).toEqual(EMPTY_RULE);
  });
  it('reports problems', () => {
    expect(ruleProblems({ ...EMPTY_RULE, interval: 0, monthdays: [32], seasonFrom: 10 })).toEqual([
      'interval',
      'monthday',
      'season',
    ]);
    expect(ruleProblems(EMPTY_RULE)).toEqual([]);
  });
  it('describes rules in plain words', () => {
    expect(describeRule({ freq: 'weekly', byweekday: [0, 1, 2, 3, 4], each: 'bed' })).toBe(
      'Every week on Mon, Tue, Wed, Thu, Fri; each bed',
    );
    expect(describeRule({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks');
    expect(
      describeRule({ freq: 'monthly', bymonthday: [1], season: { from_month: 10, to_month: 4 } }),
    ).toBe('Every month on day 1, Oct to Apr');
  });
});
