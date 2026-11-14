import { describe, expect, it } from 'vitest';
import { configure } from '../i18n';
import { normalize } from '../money';
import { buildContext } from '../aicontext';
import { localAnswer, looksLikeQuestion } from '../localanswer';

const NOW = new Date(2026, 10, 16, 12);
let n = 0;
const exp = (date, amount, category, note) => ({ id: `c${++n}`, date, amount, category, note, createdAt: n });
const state = normalize({
  profile: { name: 'Putri Secret' },
  startMonth: '2026-10',
  plans: { '2026-10': { salary: 6_000_000, needsPercent: 70 } },
  limits: { Coffee: 100_000 },
  goals: [{ id: 'g', name: 'Bali', target: 5_000_000 }],
  expenses: [
    exp('2026-10-05', 50_000, 'Coffee', 'kopi di tempat rahasia'),
    exp('2026-11-02', 40_000, 'Coffee', 'kopi'),
    exp('2026-11-03', 40_000, 'Coffee', 'kopi'),
    exp('2026-11-04', 40_000, 'Coffee', 'kopi'),
    exp('2026-11-05', 300_000, 'Shopping', 'baju untuk pacar'),
  ],
});

describe('buildContext', () => {
  const ctx = buildContext(state, NOW);

  it('never includes notes or her name', () => {
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('rahasia');
    expect(json).not.toContain('pacar');
    expect(json).not.toContain('Putri');
  });

  it('compares categories with last month by the same day', () => {
    const coffee = ctx.categories.find((c) => c.category === 'Coffee');
    expect(coffee).toMatchObject({ spentThisMonthSoFar: 120_000, spentLastMonthBySameDay: 50_000, changeVsLastMonthBySameDay: 70_000, monthlyLimit: 100_000 });
  });

  it('includes budget, limits and goals as totals', () => {
    expect(ctx.income).toMatchObject({ monthlyIncome: 6_000_000, monthlySpendingBudget: 4_200_000 });
    expect(ctx.categoryLimits[0]).toMatchObject({ category: 'Coffee', status: 'over' });
    expect(ctx.goals[0]).toMatchObject({ name: 'Bali', target: 5_000_000 });
  });
});

describe('local answers', () => {
  it('spots questions', () => {
    expect(looksLikeQuestion('ANALYZE my savings')).toBe(true);
    expect(looksLikeQuestion('look where we can improve or where i can control ?')).toBe(true);
    expect(looksLikeQuestion('aku bisa hemat di mana')).toBe(true);
    expect(looksLikeQuestion('beli HP 3 juta')).toBe(false);
  });

  it('answers from the summary', () => {
    configure({ lang: 'en', currency: 'IDR' });
    const a = localAnswer(buildContext(state, NOW));
    expect(a.text).toContain('420.000'); // spent so far
    expect(a.text).toContain('Coffee is over its limit');
    expect(a.suggestions.length).toBeGreaterThan(0);
  });
});
