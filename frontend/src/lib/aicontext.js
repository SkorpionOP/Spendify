import { addDaysISO, addMonths, cycleEnd, cycleStart, dayOfCycle, monthKey, toISODate } from './dates';
import { goalProgress, limitStatus, monthSummary } from './money';
import { monthInsights } from './insights';
import { baseline } from './twin';
import { debtSummary } from './iou';

/*
 * The summary the AI assistant may see. Totals only: no individual expenses, no notes, no name.
 * Field names spell out what each number means, and comparisons are worked out here, so the AI
 * doesn't have to (and can't get them backwards). Amounts are whole units of `currency`.
 */
const round = (n) => Math.round(Number(n) || 0);

const iouTotals = (state, day) => {
  const s = debtSummary(state.debts || [], day);
  return { moneyOthersOweHer: round(s.owedToMe), moneySheOwesOthers: round(s.iOwe), openIous: s.open, pastDueDate: s.overdue };
};

/** Today, yesterday, this/last week (Monday to Sunday) and this/last budget month, as ISO dates. */
export const dateRanges = (now = new Date()) => {
  const today = toISODate(now);
  const monday = addDaysISO(today, -((now.getDay() + 6) % 7));
  const key = monthKey(today);
  return {
    yesterday: addDaysISO(today, -1),
    thisWeek: { from: monday, to: today },
    lastWeek: { from: addDaysISO(monday, -7), to: addDaysISO(monday, -1) },
    thisMonth: { from: cycleStart(key), to: today },
    lastMonth: { from: cycleStart(addMonths(key, -1)), to: cycleEnd(addMonths(key, -1)) },
  };
};

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
    // Worked out here so "last week" or "bulan lalu" in a lookup always means the same days as in the app
    dateRanges: dateRanges(now),
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
    // IOUs as totals only, never names. Not part of the budget or savings figures above.
    iou: iouTotals(state, toISODate(now)),
    monthlyRepeats: (state.recurring || []).map((r) => ({ category: r.category, amount: round(r.amount), mandatory: r.mandatory !== false })),
  };
};

/**
 * What the AI may see to write a short recap of a finished week or month: totals per category for
 * that period and the one before, plus budget, savings and goals. Same rules as buildContext: no
 * individual expenses, no notes, no name.
 */
export const recapContext = (state, { kind, from, to, prevFrom, prevTo, month = null }, now = new Date()) => {
  const sum = (a, z) => {
    const by = {};
    const days = new Set();
    let total = 0;
    let count = 0;
    for (const e of state.expenses) {
      if (e.date < a || e.date > z) continue;
      total += e.amount;
      count++;
      days.add(e.date);
      by[e.category] = by[e.category] || { total: 0, count: 0 };
      by[e.category].total += e.amount;
      by[e.category].count++;
    }
    return { by, total, count, days: days.size };
  };
  const cur = sum(from, to);
  const prev = sum(prevFrom, prevTo);
  const length = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const categories = [...new Set([...Object.keys(cur.by), ...Object.keys(prev.by)])]
    .map((category) => ({
      category,
      spent: round(cur.by[category]?.total),
      purchases: cur.by[category]?.count || 0,
      spentPreviousPeriod: round(prev.by[category]?.total),
      change: round((cur.by[category]?.total || 0) - (prev.by[category]?.total || 0)), // positive = spent MORE
    }))
    .sort((a, z) => z.spent - a.spent)
    .slice(0, 12);

  const b = baseline(state, now);
  const out = {
    currency: state.settings.currency,
    period: kind,
    from,
    to,
    totalSpent: round(cur.total),
    purchases: cur.count,
    daysWithNoSpending: Math.max(0, length - cur.days),
    previousPeriodSpent: round(prev.total),
    changeVsPreviousPeriod: round(cur.total - prev.total), // positive = spent MORE
    categories,
    savingsNow: round(b.savingsNow),
    goals: goalProgress(state.goals || [], b.savingsNow).list.map((g) => ({ name: g.name, target: round(g.target), stillNeeded: round(g.missing) })),
  };
  if (kind === 'month' && month) {
    const m = monthSummary(state, month);
    if (m) {
      out.monthlyIncome = round(m.plan.salary);
      out.spendingBudget = round(m.budget);
      out.budgetLeftUnspent = round(m.leftBudget); // went into savings
      out.overBudgetTakenFromSavings = round(m.fromSavings);
    }
    out.categoryLimits = limitStatus(state, month).map((l) => ({ category: l.category, limit: round(l.limit), spent: round(l.spent), status: l.level }));
  }
  return out;
};
