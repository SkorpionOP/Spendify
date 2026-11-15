import { dayOfCycle, daysInMonth, monthKey, toISODate } from './dates';
import { goalProgress, monthSummary } from './money';
import { monthInsights } from './insights';

/*
 * Little celebrations on Home: "halfway to your phone", "payday tomorrow and money left", "spending less
 * than last month". At most one at a time, and each one only once (`seen` holds the keys already shown).
 * Pure, so it can be tested; Home turns the result into words.
 */

const GOAL_STEPS = [
  ['done', (g) => g.done],
  ['90', (g) => g.frac >= 0.9],
  ['75', (g) => g.frac >= 0.75],
  ['50', (g) => g.frac >= 0.5],
];

/** The highest goal milestone not shown yet, with all lower ones for the same goal (so they never show late). */
const goalCheers = (goals, seen) => {
  const out = [];
  for (const g of goals) {
    const i = GOAL_STEPS.findIndex(([, ok]) => ok(g));
    if (i < 0) continue;
    const step = GOAL_STEPS[i][0];
    const key = `goal:${g.id}:${step}`;
    if (seen.has(key)) continue;
    const covers = GOAL_STEPS.slice(i).map(([s]) => `goal:${g.id}:${s}`);
    out.push({ type: `goal-${step}`, key, covers, name: g.name, saved: g.saved, target: g.target, missing: g.missing });
  }
  return out;
};

export const pickCheer = (state, now = new Date(), seen = new Set()) => {
  if (!state.profile) return null;
  const iso = toISODate(now);
  const key = monthKey(iso);
  const summary = monthSummary(state, key);
  if (!summary) return null;

  const goals = goalCheers(goalProgress(state.goals || [], summary.leftSavings).list, seen);
  const byType = (type) => goals.find((c) => c.type === type);

  // Last day before payday, with budget still unspent: it rolls into savings.
  const daysLeft = daysInMonth(key) - dayOfCycle(iso) + 1;
  const left = summary.budget - summary.spent;
  const payday =
    daysLeft === 1 && summary.budget > 0 && left > 0 && !seen.has(`payday:${key}`)
      ? { type: 'payday', key: `payday:${key}`, covers: [`payday:${key}`], left }
      : null;

  // Spending clearly less than last month by the same day; at most once a week.
  let pace = null;
  const m = monthInsights(state, key, now);
  if (m.elapsed >= 7 && m.prevAtSameDay > 0 && m.total > 0 && m.total <= m.prevAtSameDay * 0.85) {
    const k = `pace:${key}:${Math.floor(m.elapsed / 7)}`;
    if (!seen.has(k)) pace = { type: 'pace', key: k, covers: [k], pct: Math.round((1 - m.total / m.prevAtSameDay) * 100), saved: m.prevAtSameDay - m.total };
  }

  return byType('goal-done') || payday || byType('goal-90') || pace || byType('goal-75') || byType('goal-50') || null;
};
