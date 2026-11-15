import { describe, expect, it } from 'vitest';
import { normalize } from '../money';
import { pickCheer } from '../cheers';

const exp = (date, amount) => ({ id: `${date}-${amount}`, date, amount, category: 'Food', note: '', createdAt: 0 });

// Income 2.000.000, half saved: 1.000.000 savings this month (plus anything carried in).
const state = ({ goals = [], expenses = [] } = {}) =>
  normalize({
    profile: { name: 'T' },
    startMonth: '2026-11',
    plans: { '2026-11': { salary: 2_000_000, needsPercent: 50 } },
    goals,
    expenses,
  });
const mid = new Date(2026, 10, 10, 9);

describe('pickCheer', () => {
  it('cheers the highest goal milestone reached', () => {
    const c = pickCheer(state({ goals: [{ id: 'g', name: 'Phone', target: 1_100_000 }] }), mid);
    expect(c).toMatchObject({ type: 'goal-90', name: 'Phone', missing: 100_000 });
    expect(c.covers).toEqual(['goal:g:90', 'goal:g:75', 'goal:g:50']);
  });

  it('shows each milestone once', () => {
    const s = state({ goals: [{ id: 'g', name: 'Phone', target: 1_100_000 }] });
    expect(pickCheer(s, mid, new Set(['goal:g:90', 'goal:g:75', 'goal:g:50']))).toBeNull();
  });

  it('celebrates a reached goal first', () => {
    const c = pickCheer(state({ goals: [{ id: 'b', name: 'Done', target: 100_000 }, { id: 'a', name: 'Half', target: 1_600_000 }] }), mid);
    expect(c.type).toBe('goal-done');
  });

  it('says payday is tomorrow when budget is left', () => {
    const c = pickCheer(state({ expenses: [exp('2026-11-02', 300_000)] }), new Date(2026, 10, 30, 9));
    expect(c).toMatchObject({ type: 'payday', left: 700_000 });
  });

  it('notices spending less than last month by the same day', () => {
    const s = normalize({
      ...state(),
      startMonth: '2026-10',
      plans: { '2026-10': { salary: 2_000_000, needsPercent: 50 } },
      expenses: [exp('2026-10-05', 500_000), exp('2026-11-05', 300_000)],
    });
    expect(pickCheer(s, mid)).toMatchObject({ type: 'pace', pct: 40 });
  });

  it('stays quiet with nothing to celebrate', () => {
    expect(pickCheer(state({ expenses: [exp('2026-11-02', 100_000)] }), mid)).toBeNull();
  });
});
