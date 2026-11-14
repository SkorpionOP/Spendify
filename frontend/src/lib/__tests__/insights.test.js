import { describe, expect, it } from 'vitest';
import { normalize } from '../money';
import { monthInsights } from '../insights';

let n = 0;
const exp = (date, amount, category = 'Food', note = '', extra = {}) => ({ id: `i${++n}`, date, amount, category, note, createdAt: n, ...extra });
const state = (expenses, extra = {}) =>
  normalize({ startMonth: '2026-10', plans: { '2026-10': { salary: 2_000_000, needsPercent: 50 } }, expenses, ...extra });

const NOW = new Date(2026, 10, 10, 12); // Tue 10 Nov 2026

describe('monthInsights', () => {
  const s = state(
    [
      exp('2026-11-01', 1_000_000, 'Rent', 'Kos', { recurringId: 'r' }),
      exp('2026-11-02', 18_000, 'Coffee', 'Kopi susu'),
      exp('2026-11-04', 18_000, 'Coffee', 'kopi susu '),
      exp('2026-11-07', 18_000, 'Coffee', 'Kopi Susu'),
      exp('2026-11-07', 46_000, 'Food', 'Bakso', { pay: 'gopay' }),
      exp('2026-10-03', 100_000, 'Coffee'),
      exp('2026-10-20', 300_000, 'Food'),
    ],
    { limits: { Coffee: 50_000 } }
  );
  const r = monthInsights(s, '2026-11', NOW);

  it('totals the month and knows how far in we are', () => {
    expect(r.total).toBe(1_100_000);
    expect(r.elapsed).toBe(10);
    expect(r.line).toHaveLength(10);
    expect(r.line[9].total).toBe(1_100_000);
    expect(r.budget).toBe(1_000_000);
  });

  it('compares with last month at the same day', () => {
    expect(r.prevAtSameDay).toBe(100_000);
    expect(r.prevTotal).toBe(400_000);
  });

  it('forecasts everyday spending at its pace, counting repeats once', () => {
    // 100k everyday over 10 days → 300k over 30 days, plus the 1M rent
    expect(r.forecast).toBe(1_300_000);
  });

  it('lists categories with last month and limits', () => {
    const coffee = r.categories.find((c) => c.name === 'Coffee');
    expect(coffee).toMatchObject({ total: 54_000, count: 3, prevTotal: 100_000, limit: 50_000 });
    expect(r.categories[0].name).toBe('Rent');
  });

  it('spots small habits regardless of spelling case, but not repeats', () => {
    expect(r.habits).toEqual([{ note: 'Kopi susu', category: 'Coffee', count: 3, total: 54_000 }]);
  });

  it('counts payments and days without spending', () => {
    expect(r.payments).toEqual([{ id: 'gopay', amount: 46_000 }]);
    expect(r.noSpendDays).toBe(6); // spent on the 1st, 2nd, 4th and 7th
  });

  it('shows past months in full and future months empty', () => {
    expect(monthInsights(s, '2026-10', NOW)).toMatchObject({ elapsed: 31, forecast: null, total: 400_000 });
    expect(monthInsights(s, '2026-12', NOW)).toMatchObject({ elapsed: 0, total: 0 });
  });

  it('finds the priciest weekday once there are two weeks of history', () => {
    // Expenses begin 3 Oct, so there are enough days. Tuesday 20 Oct has the 300k food.
    expect(r.peakWeekday?.index).toBe(1);
    const short = state([exp('2026-11-07', 10)]);
    expect(monthInsights(short, '2026-11', NOW).peakWeekday).toBeNull();
  });
});
