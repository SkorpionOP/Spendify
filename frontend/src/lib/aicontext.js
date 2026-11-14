import { addMonths, dayOfCycle, monthKey, toISODate } from './dates';
import { goalProgress, limitStatus } from './money';
import { monthInsights } from './insights';
import { baseline } from './twin';

/*
 * The summary the AI assistant may see. Totals only: no individual expenses, no notes, no name.
 * Field names spell out what each number means, and comparisons are worked out here, so the AI
 * doesn't have to (and can't get them backwards). Amounts are whole units of `currency`.
 */
const round = (n) => Math.round(Number(n) || 0);

export const buildContext = (state, now = new Date()) => {
  const key = monthKey(toISODate(now));
  const prevKey = addMonths(key, -1);
  const day = dayOfCycle(toISODate(now));
  const b = baseline(state, now);
  const m = monthInsights(state, key, now);
  const goals = goalProgress(state.goals || [], b.savingsNow).list;

  // Last month up to the same day of the month, per category: a fair comparison mid-month
  const prevSameDay = {};
  for (const e of state.expenses) {
    if (monthKey(e.date) === prevKey && dayOfCycle(e.date) <= day) prevSameDay[e.category] = (prevSameDay[e.category] || 0) + e.amount;
  }
  const cats = new Set([...m.categories.map((c) => c.name), ...Object.keys(prevSameDay)]);
  const thisCat = Object.fromEntries(m.categories.map((c) => [c.name, c]));
  const byCategory = [...cats]
    .map((name) => {
      const now_ = round(thisCat[name]?.total);
      const before = round(prevSameDay[name]);
      return {
        category: name,
        spentThisMonthSoFar: now_,
        purchasesThisMonth: thisCat[name]?.count || 0,
        spentLastMonthBySameDay: before,
        changeVsLastMonthBySameDay: now_ - before, // positive = spending MORE than last month
        usualPerMonth: round(b.catAvg[name]),
        monthlyLimit: state.limits?.[name] ? round(state.limits[name]) : null,
      };
    })
    .sort((a, z) => z.spentThisMonthSoFar - a.spentThisMonthSoFar)
    .slice(0, 12);

  const forecast = m.forecast != null ? round(m.forecast) : null;
  return {
    currency: state.settings.currency,
    today: toISODate(now),
    month: { dayOfMonth: day, daysInMonth: m.days, daysLeftIncludingToday: m.days - day + 1 },
    income: {
      monthlyIncome: round(b.income),
      monthlySpendingBudget: round(b.budget),
      plannedSavingsPerMonth: round(b.plannedSavings),
    },
    spendingThisMonth: {
      spentSoFar: round(m.total),
      spendingBudgetLeft: round(b.budget - m.total),
      lastMonthBySameDay: m.prevAtSameDay != null ? round(m.prevAtSameDay) : null,
      forecastTotalSpendingByMonthEnd: forecast,
      forecastBudgetLeftOverAtMonthEnd: forecast != null ? round(b.budget - forecast) : null, // negative = over budget, taken from savings
      daysWithNoSpending: m.noSpendDays,
      priciestWeekdayLast8Weeks: m.peakWeekday ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][m.peakWeekday.index] : null,
    },
    usualMonth: {
      averageMonthlySpending: round(b.avgSpend),
      averageLeftOverPerMonth: round(b.income - b.avgSpend), // what usually goes into savings
      basedOnPastMonths: b.hasHistory,
    },
    categories: byCategory,
    repeatedSmallPurchasesThisMonth: m.habits.map((h) => ({ category: h.category, times: h.count, total: round(h.total) })),
    savings: {
      totalSavingsNow: round(b.savingsNow),
      notYetAssignedToGoals: round(Math.max(0, b.savingsNow - goals.reduce((s, g) => s + g.saved, 0))),
    },
    goals: goals.map((g) => ({
      name: g.name,
      target: round(g.target),
      alreadyCoveredBySavings: round(g.saved),
      stillNeeded: round(g.missing),
      targetMonth: g.by || null,
    })),
    categoryLimits: limitStatus(state, key).map((l) => ({ category: l.category, limit: round(l.limit), spentThisMonth: round(l.spent), status: l.level })),
    monthlyRepeats: (state.recurring || []).map((r) => ({ category: r.category, amount: round(r.amount), mandatory: r.mandatory !== false })),
  };
};
