// PM rule builder: form fields to the pm_schedule.rule JSON and back, plus a plain description.
// Weekdays are 0 = Monday .. 6 = Sunday (as in the database).

export type Freq = 'daily' | 'weekly' | 'monthly';
export type RuleForm = {
  freq: Freq;
  interval: number;
  weekdays: number[];
  monthdays: number[];
  seasonFrom: number | null; // 1..12
  seasonTo: number | null;
  each: '' | 'bed' | 'zone';
  start: string; // yyyy-mm-dd or ''
};
export type Rule = {
  freq: Freq;
  interval?: number;
  byweekday?: number[];
  bymonthday?: number[];
  season?: { from_month: number; to_month: number };
  each?: string;
  start?: string;
};

export const EMPTY_RULE: RuleForm = {
  freq: 'weekly',
  interval: 1,
  weekdays: [0, 1, 2, 3, 4],
  monthdays: [],
  seasonFrom: null,
  seasonTo: null,
  each: '',
  start: '',
};

export function toRule(f: RuleForm): Rule {
  const r: Rule = { freq: f.freq };
  if (f.interval > 1) r.interval = Math.trunc(f.interval);
  if (f.freq !== 'monthly' && f.weekdays.length)
    r.byweekday = [...new Set(f.weekdays)].sort((a, b) => a - b);
  if (f.freq === 'monthly' && f.monthdays.length)
    r.bymonthday = [...new Set(f.monthdays)].sort((a, b) => a - b);
  if (f.seasonFrom && f.seasonTo) r.season = { from_month: f.seasonFrom, to_month: f.seasonTo };
  if (f.each) r.each = f.each;
  if (f.start) r.start = f.start;
  return r;
}

export function fromRule(r: Partial<Rule> | null | undefined): RuleForm {
  if (!r?.freq) return { ...EMPTY_RULE };
  return {
    freq: r.freq,
    interval: r.interval ?? 1,
    weekdays: r.byweekday ?? [],
    monthdays: r.bymonthday ?? [],
    seasonFrom: r.season?.from_month ?? null,
    seasonTo: r.season?.to_month ?? null,
    each: r.each === 'bed' || r.each === 'zone' ? r.each : '',
    start: r.start ?? '',
  };
}

/** Problems with a rule form; empty when it can be saved. */
export function ruleProblems(f: RuleForm): string[] {
  const p: string[] = [];
  if (!(Number.isInteger(f.interval) && f.interval >= 1)) p.push('interval');
  if (f.monthdays.some((d) => d < 1 || d > 31)) p.push('monthday');
  if ((f.seasonFrom == null) !== (f.seasonTo == null)) p.push('season');
  return p;
}

const DAY = { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** English summary used in lists, for example "Every week on Mon, Tue, Wed, Thu, Fri; each bed". */
export function describeRule(r: Partial<Rule> | null | undefined): string {
  if (!r?.freq) return '';
  const n = r.interval ?? 1;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[r.freq];
  let s = n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
  if (r.byweekday?.length) s += ` on ${r.byweekday.map((d) => DAY.en[d]).join(', ')}`;
  if (r.bymonthday?.length) s += ` on day ${r.bymonthday.join(', ')}`;
  if (r.season) s += `, ${MONTH[r.season.from_month - 1]} to ${MONTH[r.season.to_month - 1]}`;
  if (r.each) s += `; each ${r.each}`;
  return s;
}
