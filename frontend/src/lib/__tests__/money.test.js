import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyRecurring, goalProgress, limitStatus, monthSummary, normalize, planFor } from '../money';
import { dueCheckins } from '../money';
import { previewAfter, monthPicture } from '../budget';

let n = 0;
const exp = (date, amount, category = 'Food', extra = {}) => ({ id: `e${++n}`, date, amount, category, note: '', createdAt: 0, ...extra });

const base = (over = {}) =>
  normalize({
    profile: { name: 'Test' },
    startMonth: '2026-09',
    plans: { '2026-09': { salary: 10_000_000, needsPercent: 70 } },
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0)); // 15 Nov 2026
});
afterEach(() => vi.useRealTimers());

describe('planFor', () => {
  it('uses the latest plan that started on or before the month', () => {
    const s = base({ plans: { '2026-09': { salary: 1000, needsPercent: 50 }, '2026-11': { salary: 2000, needsPercent: 80 } } });
    expect(planFor(s, '2026-10').salary).toBe(1000);
    expect(planFor(s, '2026-11').salary).toBe(2000);
    expect(planFor(s, '2027-03').salary).toBe(2000);
  });
  it('falls back to the earliest plan for months before any plan', () => {
    expect(planFor(base(), '2026-01').salary).toBe(10_000_000);
  });
});

describe('monthSummary', () => {
  it('splits income into budget and savings', () => {
    const m = monthSummary(base(), '2026-09');
    expect(m.budget).toBe(7_000_000);
    expect(m.savings).toBe(3_000_000);
    expect(m.carriedIn).toBe(0);
  });

  it('carries unspent budget and savings into next month', () => {
    const oct = monthSummary(base({ expenses: [exp('2026-09-10', 2_000_000)] }), '2026-10');
    // September: 5M budget left + 3M savings = 8M carried
    expect(oct.carriedIn).toBe(8_000_000);
    expect(oct.savings).toBe(11_000_000);
  });

  it('takes overspending out of savings, and never carries a negative', () => {
    const sep = monthSummary(base({ expenses: [exp('2026-09-10', 9_000_000)] }), '2026-09');
    expect(sep.fromSavings).toBe(2_000_000);
    expect(sep.leftBudget).toBe(0);
    expect(sep.leftSavings).toBe(1_000_000);

    const broke = base({ expenses: [exp('2026-09-10', 20_000_000)] });
    expect(monthSummary(broke, '2026-09').leftSavings).toBe(-10_000_000);
    expect(monthSummary(broke, '2026-10').carriedIn).toBe(0);
  });

  it('adds top-ups to budget or savings for that month only', () => {
    const s = base({ topups: { '2026-11': { needs: 500_000, savings: 250_000 } } });
    const nov = monthSummary(s, '2026-11');
    expect(nov.budget).toBe(7_500_000);
    expect(nov.savings - nov.carriedIn).toBe(3_250_000);
    expect(monthSummary(s, '2026-10').budget).toBe(7_000_000);
  });

  it('starts from the first expense even if it is older than startMonth', () => {
    const s = base({ startMonth: '2026-11', expenses: [exp('2026-10-01', 1_000_000)] });
    expect(monthSummary(s, '2026-11').carriedIn).toBe(9_000_000);
  });
});

describe('monthPicture', () => {
  const plans = { '2026-11': { salary: 10_000_000, needsPercent: 70 } };

  it('works out today’s share from what was left this morning', () => {
    // 15 Nov: 16 days left including today. 7M budget, 1.6M spent before today, 100k today.
    const s = base({ startMonth: '2026-11', plans, expenses: [exp('2026-11-02', 1_600_000), exp('2026-11-15', 100_000)] });
    const p = monthPicture(s);
    expect(p.daysLeft).toBe(16);
    expect(p.allowance).toBeCloseTo(5_400_000 / 16);
    expect(p.todayLeft).toBeCloseTo(5_400_000 / 16 - 100_000);
    expect(p.status).toBe('ok');
  });

  it('flags spending ahead of pace and over budget', () => {
    expect(monthPicture(base({ startMonth: '2026-11', plans, expenses: [exp('2026-11-02', 4_000_000)] })).status).toBe('fast');
    expect(monthPicture(base({ startMonth: '2026-11', plans, expenses: [exp('2026-11-02', 8_000_000)] })).status).toBe('over');
    expect(monthPicture(base({ startMonth: '2026-11', plans: {} })).status).toBe('none');
  });
});

describe('previewAfter', () => {
  const plans = { '2026-11': { salary: 1_000_000, needsPercent: 50 } };

  it('shows what is left after a new expense', () => {
    const s = base({ startMonth: '2026-11', plans, expenses: [exp('2026-11-01', 100_000)] });
    const p = previewAfter(s, { amount: 50_000, date: '2026-11-15' });
    expect(p.left).toBe(350_000);
    expect(p.fromSavings).toBe(0);
  });

  it('counts only the new money taken from savings', () => {
    const s = base({ startMonth: '2026-11', plans, expenses: [exp('2026-11-01', 450_000)] });
    const p = previewAfter(s, { amount: 100_000, date: '2026-11-15' });
    expect(p.fromSavings).toBe(50_000);
    expect(p.savingsLeft).toBe(450_000);
  });

  it('does not double count the expense being edited', () => {
    const e = exp('2026-11-01', 300_000);
    const s = base({ startMonth: '2026-11', plans, expenses: [e] });
    expect(previewAfter(s, { amount: 200_000, date: '2026-11-01', replacingId: e.id }).left).toBe(300_000);
  });
});

describe('applyRecurring', () => {
  const rule = { id: 'r1', amount: 1_500_000, category: 'Rent', note: 'Kos', day: 5, since: '2026-09', lastRun: null, skippedMonths: [] };
  const dates = (s) => s.expenses.map((e) => e.date).sort();

  it('catches up every missed month once, and not again', () => {
    const once = applyRecurring(base({ recurring: [rule] }));
    expect(dates(once)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
    expect(applyRecurring(once)).toBe(once);
  });

  it('waits until the day comes this month', () => {
    expect(dates(applyRecurring(base({ recurring: [{ ...rule, day: 20 }] })))).toEqual(['2026-09-20', '2026-10-20']);
  });

  it('uses the last day of short months', () => {
    vi.setSystemTime(new Date(2027, 2, 31));
    expect(dates(applyRecurring(base({ recurring: [{ ...rule, day: 31, since: '2027-02' }] })))).toEqual(['2027-02-28', '2027-03-31']);
  });

  it('leaves out skipped months', () => {
    expect(dates(applyRecurring(base({ recurring: [{ ...rule, skippedMonths: ['2026-10'] }] })))).toEqual(['2026-09-05', '2026-11-05']);
  });
});

describe('goalProgress', () => {
  const goals = [
    { id: 'a', name: 'HP baru', target: 3_000_000 },
    { id: 'b', name: 'Bali', target: 5_000_000 },
  ];

  it('fills goals in order', () => {
    const { list, spare } = goalProgress(goals, 4_000_000);
    expect(list[0]).toMatchObject({ saved: 3_000_000, done: true, frac: 1 });
    expect(list[1]).toMatchObject({ saved: 1_000_000, done: false, missing: 4_000_000 });
    expect(spare).toBe(0);
  });

  it('keeps money left over after all goals, and treats negative savings as zero', () => {
    expect(goalProgress(goals, 9_000_000).spare).toBe(1_000_000);
    expect(goalProgress(goals, -50).list.every((g) => g.saved === 0)).toBe(true);
  });
});

describe('limitStatus', () => {
  const s = base({
    limits: { Coffee: 200_000, Snacks: 100_000 },
    expenses: [exp('2026-11-02', 170_000, 'Coffee'), exp('2026-10-02', 999_000, 'Coffee'), exp('2026-11-03', 20_000, 'Snacks')],
  });

  it('only counts the month asked for, worst first', () => {
    const [coffee, snacks] = limitStatus(s, '2026-11');
    expect(coffee).toMatchObject({ category: 'Coffee', spent: 170_000, left: 30_000, level: 'near' });
    expect(snacks).toMatchObject({ category: 'Snacks', level: 'ok' });
  });

  it('includes an expense being typed', () => {
    const [coffee] = limitStatus(s, '2026-11', { amount: 50_000, category: 'Coffee', date: '2026-11-15' });
    expect(coffee.level).toBe('over');
    expect(coffee.left).toBe(-20_000);
  });
});

describe('normalize', () => {
  it('upgrades old data without losing anything', () => {
    const s = normalize({ plans: { '2026-01': { salary: 1, needsPercent: 50 } }, expenses: [{ id: 'x', amount: '25000', date: '2026-01-02' }] });
    expect(s.expenses[0]).toMatchObject({ amount: 25000, category: 'Others', note: '' });
    expect(s.goals).toEqual([]);
    expect(s.limits).toEqual({});
    expect(s.settings.trackPayment).toBe(false);
  });

  it('drops broken rows instead of crashing', () => {
    const s = normalize({ expenses: [null, { amount: 0, date: '2026-01-01' }, { amount: 5 }], goals: [{ id: 'g', target: 0 }], limits: { Food: 'abc' } });
    expect(s.expenses).toEqual([]);
    expect(s.goals).toEqual([]);
    expect(s.limits).toEqual({});
  });
});

describe('daily check-ins', () => {
  const monday = new Date(2026, 10, 16, 8); // Mon 16 Nov 2026
  const base = (extra = {}) =>
    normalize({ checkins: [{ id: 'fuel', name: 'Isi bensin motor', category: 'Transport', amount: 25000, days: [0, 1, 2, 3, 4], ...extra }] });

  it('asks on the chosen days', () => {
    expect(dueCheckins(base(), monday).map((c) => c.id)).toEqual(['fuel']);
    expect(dueCheckins(base(), new Date(2026, 10, 15, 8))).toEqual([]); // Sunday
  });
  it('asks only once a day', () => {
    expect(dueCheckins(base({ askedOn: '2026-11-16' }), monday)).toEqual([]);
    const logged = { ...base(), expenses: [{ id: 'e', amount: 20000, date: '2026-11-16', category: 'Transport', note: '', checkinId: 'fuel' }] };
    expect(dueCheckins(logged, monday)).toEqual([]);
  });
});
