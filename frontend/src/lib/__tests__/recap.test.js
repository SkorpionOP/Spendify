import { describe, expect, it } from 'vitest';
import { normalize } from '../money';
import { monthRecap, weekRecap, weekStart } from '../recap';

const exp = (date, amount, category = 'Food') => ({ id: `${date}-${amount}`, date, amount, category, note: '', createdAt: 0 });
const state = (expenses) =>
  normalize({ profile: { name: 'T' }, startMonth: '2026-10', plans: { '2026-10': { salary: 2_000_000, needsPercent: 50 } }, expenses });

describe('monthRecap', () => {
  const s = state([exp('2026-10-03', 600_000)]);

  it('shows during the first 7 days of the next month', () => {
    expect(monthRecap(s, new Date(2026, 10, 7))).toMatchObject({ key: '2026-10', spent: 600_000, budget: 1_000_000, leftBudget: 400_000 });
  });

  it('hides after the 7th, and before there is a finished month', () => {
    expect(monthRecap(s, new Date(2026, 10, 8))).toBeNull();
    expect(monthRecap(s, new Date(2026, 9, 3))).toBeNull();
  });

  it('hides when nothing was spent', () => {
    expect(monthRecap(state([]), new Date(2026, 10, 2))).toBeNull();
  });

  it('handles January looking back at December', () => {
    const d = normalize({ startMonth: '2026-12', plans: { '2026-12': { salary: 100, needsPercent: 100 } }, expenses: [exp('2026-12-24', 50)] });
    expect(monthRecap(d, new Date(2027, 0, 1))?.key).toBe('2026-12');
  });
});

describe('weekRecap', () => {
  // Mon 9 to Sun 15 Nov 2026 is "last week" when today is Mon 16 Nov.
  const s = state([
    exp('2026-11-09', 100_000, 'Coffee'),
    exp('2026-11-15', 50_000, 'Food'),
    exp('2026-11-10', 25_000, 'Coffee'),
    exp('2026-11-04', 250_000, 'Food'), // the week before
    exp('2026-11-16', 999_000, 'Food'), // this week, ignored
  ]);

  it('finds Monday', () => {
    expect(weekStart(new Date(2026, 10, 15)).getDate()).toBe(9); // Sunday belongs to the week that began Monday 9th
    expect(weekStart(new Date(2026, 10, 16)).getDate()).toBe(16);
  });

  it('sums last Monday to Sunday and compares with the week before', () => {
    const r = weekRecap(s, new Date(2026, 10, 16));
    expect(r).toMatchObject({
      from: '2026-11-09',
      to: '2026-11-15',
      spent: 175_000,
      prevSpent: 250_000,
      count: 3,
      topCat: 'Coffee',
      topAmount: 125_000,
      noSpendDays: 4,
    });
    expect(r.change).toBeCloseTo(-0.3);
  });

  it('shows Monday to Wednesday only', () => {
    expect(weekRecap(s, new Date(2026, 10, 18))).not.toBeNull();
    expect(weekRecap(s, new Date(2026, 10, 19))).toBeNull();
  });

  it('has no comparison when the week before was empty, and nothing at all when last week was empty', () => {
    expect(weekRecap(state([exp('2026-11-12', 10)]), new Date(2026, 10, 16)).change).toBeNull();
    expect(weekRecap(state([exp('2026-11-02', 10)]), new Date(2026, 10, 16))).toBeNull();
  });
});
