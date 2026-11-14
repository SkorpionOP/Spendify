import { describe, expect, it } from 'vitest';
import { normalize } from '../money';
import { baseline, project, simulate } from '../twin';

let n = 0;
const exp = (date, amount, category = 'Food') => ({ id: `t${++n}`, date, amount, category, note: '', createdAt: n });
const NOW = new Date(2026, 10, 15, 12); // 15 Nov 2026

// Income 5M (60% budget = 3M, 2M planned savings). She spent 3M in each of Aug, Sep, Oct.
const state = normalize({
  startMonth: '2026-08',
  plans: { '2026-08': { salary: 5_000_000, needsPercent: 60 } },
  goals: [{ id: 'g', name: 'Laptop', target: 10_000_000 }],
  expenses: [
    exp('2026-08-10', 2_500_000), exp('2026-08-11', 500_000, 'Shopping'),
    exp('2026-09-10', 2_500_000), exp('2026-09-11', 500_000, 'Shopping'),
    exp('2026-10-10', 2_500_000), exp('2026-10-11', 500_000, 'Shopping'),
    exp('2026-11-02', 1_500_000), // half of November's budget by the 15th
  ],
});

describe('baseline', () => {
  it('reads a normal month from real data', () => {
    const b = baseline(state, NOW);
    expect(b.income).toBe(5_000_000);
    expect(b.avgSpend).toBe(3_000_000);
    expect(b.catAvg.Shopping).toBe(500_000);
    expect(b.savingsNow).toBe(2_000_000 * 4); // planned 2M each month, budget fully used
    expect(b.thisMonthLeft).toBe(0); // on pace to spend exactly 3M
  });
});

describe('project', () => {
  const b = baseline(state, NOW);
  it('grows savings by income minus spending each month', () => {
    const p = project(b, []);
    expect(p.monthlyNet).toBe(2_000_000);
    expect(p.balance[0]).toBe(8_000_000);
    expect(p.balance[3]).toBe(14_000_000);
    expect(p.balance).toHaveLength(13);
  });

  it('applies each kind of change', () => {
    expect(project(b, [{ type: 'purchase', amount: 1_500_000, at: 0 }]).balance[0]).toBe(6_500_000);
    expect(project(b, [{ type: 'purchase', amount: 1_500_000, at: 2 }]).balance[2]).toBe(10_500_000);
    expect(project(b, [{ type: 'save', amount: 200_000 }]).monthlyNet).toBe(2_200_000);
    expect(project(b, [{ type: 'cut', category: 'Shopping', pct: 0.5 }]).monthlyNet).toBe(2_250_000);
    expect(project(b, [{ type: 'income', pct: 0.1 }]).monthlyNet).toBe(2_500_000);
    expect(project(b, [{ type: 'income', set: 6_000_000 }]).monthlyNet).toBe(3_000_000);
    const loan = project(b, [{ type: 'monthly', amount: 500_000, months: 2 }]);
    expect(loan.balance[3] - loan.balance[2]).toBe(2_000_000); // instalments ended after 2 months
    expect(loan.balance[2] - loan.balance[1]).toBe(1_500_000);
  });
});

describe('simulate', () => {
  it('says whether a purchase is affordable and what it does to goals', () => {
    const r = simulate(state, [{ type: 'purchase', amount: 1_500_000, name: 'HP', at: 0 }], NOW);
    expect(r.afford).toMatchObject({ ok: true, thin: false, total: 1_500_000 });
    expect(r.thisMonthLeft).toEqual({ before: 0, after: -1_500_000 });
    // 10M laptop: reached at month 1 before (8M → 10M), month 2 after (6.5M → 8.5M → 10.5M)
    expect(r.goals[0]).toMatchObject({ before: 1, after: 2 });
  });

  it('tells her when she could afford something too big for now', () => {
    const r = simulate(state, [{ type: 'purchase', amount: 12_000_000, name: 'Motor', at: 0 }], NOW);
    expect(r.afford.ok).toBe(false);
    expect(r.afford.waitUntil).toBe(2); // 8M → 10M → 12M
  });

  it('answers "when will I have X"', () => {
    const r = simulate(state, [{ type: 'target', amount: 20_000_000 }, { type: 'save', amount: 1_000_000 }], NOW);
    expect(r.targets[0]).toEqual({ amount: 20_000_000, before: 6, after: 4 });
  });

  it('never changes the real data', () => {
    const copy = JSON.stringify(state);
    simulate(state, [{ type: 'purchase', amount: 5_000_000, at: 0 }, { type: 'income', set: 1 }], NOW);
    expect(JSON.stringify(state)).toBe(copy);
  });
});
