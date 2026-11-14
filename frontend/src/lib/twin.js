import { addMonths, daysInMonth, monthKey, toISODate } from './dates';
import { goalProgress, monthSummary, planFor } from './money';

/*
 * "What if…?" — a sandbox copy of her money. It reads the real state, applies imagined changes,
 * and projects savings for the next 12 months. It never writes anything back.
 *
 * A change is one of:
 *   { type: 'purchase', amount, name, at }            one-off; at = months from now (0 = this month)
 *   { type: 'save', amount }                          spend this much less every month, from next month
 *   { type: 'cut', category, pct } | { …, amount }    spend less on one category, from next month
 *   { type: 'income', delta } | { pct } | { set }      income change, from next month
 *   { type: 'monthly', amount, name, months }         new monthly cost (months = null means ongoing)
 *   { type: 'target', amount }                        "when will I have X saved?"
 */

export const HORIZON = 12;

/** What a normal month looks like for her, from real data. */
export const baseline = (state, now = new Date()) => {
  const key = monthKey(toISODate(now));
  const plan = planFor(state, key);
  const summary = monthSummary(state, key);
  const income = plan.salary || 0;

  // Average spending over the last 3 finished months that have any expenses (repeats included).
  const perMonth = {};
  const perCat = {};
  for (const e of state.expenses) {
    const m = monthKey(e.date);
    if (m >= key || m < addMonths(key, -3)) continue;
    perMonth[m] = (perMonth[m] || 0) + e.amount;
    perCat[e.category] = (perCat[e.category] || 0) + e.amount;
  }
  const months = Object.keys(perMonth).length;

  // This month so far, and a simple forecast for the rest of it
  const day = now.getDate();
  const days = daysInMonth(key);
  const spentNow = summary?.spent || 0;
  const thisCat = {};
  for (const e of state.expenses) if (monthKey(e.date) === key) thisCat[e.category] = (thisCat[e.category] || 0) + e.amount;

  let avgSpend;
  let catAvg;
  if (months) {
    avgSpend = Object.values(perMonth).reduce((a, b) => a + b, 0) / months;
    catAvg = Object.fromEntries(Object.entries(perCat).map(([c, v]) => [c, v / months]));
  } else {
    // No finished month yet: scale this month up, or fall back to the budget.
    const scale = day >= 5 ? days / day : 0;
    avgSpend = scale ? spentNow * scale : summary?.budget || 0;
    catAvg = Object.fromEntries(Object.entries(thisCat).map(([c, v]) => [c, scale ? v * scale : v]));
  }

  const forecastThisMonth = Math.max(spentNow, day >= 5 ? (spentNow / day) * days : Math.max(spentNow, avgSpend));
  const budget = summary?.budget || 0;
  return {
    key,
    income,
    budget,
    plannedSavings: income - (income * plan.needsPercent) / 100,
    avgSpend,
    catAvg,
    savingsNow: summary?.leftSavings || 0,
    spentNow,
    // What this month adds to (or takes from) savings when it ends
    thisMonthLeft: budget - forecastThisMonth,
    hasHistory: months > 0,
  };
};

const monthlyEffect = (base, changes, k) => {
  let income = base.income;
  let spend = base.avgSpend;
  for (const c of changes) {
    if (k < 1) continue;
    if (c.type === 'income') {
      if (c.set != null) income = c.set;
      else if (c.pct != null) income += base.income * c.pct;
      else income += c.delta || 0;
    }
    if (c.type === 'save') spend -= c.amount;
    if (c.type === 'cut') {
      const catSpend = base.catAvg[c.category] || 0;
      spend -= c.pct != null ? catSpend * c.pct : Math.min(c.amount, catSpend || c.amount);
    }
    if (c.type === 'monthly' && (c.months == null || k <= c.months)) spend += c.amount;
  }
  return { income, spend: Math.max(0, spend) };
};

/** Savings at the end of this month (index 0) and the next 12 months. */
export const project = (base, changes = []) => {
  const balance = [];
  const oneOffAt = (k) => changes.filter((c) => c.type === 'purchase' && (c.at || 0) === k).reduce((s, c) => s + c.amount, 0);
  let bal = base.savingsNow + base.thisMonthLeft - oneOffAt(0);
  balance.push(bal);
  for (let k = 1; k <= HORIZON; k++) {
    const { income, spend } = monthlyEffect(base, changes, k);
    bal += income - spend - oneOffAt(k);
    balance.push(bal);
  }
  const next = monthlyEffect(base, changes, 1);
  return { balance, monthlyNet: next.income - next.spend, income: next.income, spend: next.spend };
};

/** First month index (0..12) where the balance reaches `amount`, or null. */
const reach = (balance, amount) => {
  const i = balance.findIndex((b) => b >= amount);
  return i < 0 ? null : i;
};

/** Everything the page shows: before vs after, verdicts, and goal dates. */
export const simulate = (state, changes, now = new Date()) => {
  const base = baseline(state, now);
  const before = project(base, []);
  const after = project(base, changes);
  const purchases = changes.filter((c) => c.type === 'purchase');
  const purchaseTotal = purchases.reduce((s, c) => s + c.amount, 0);

  // Goals fill in order, so goal i is reached when savings cover goals 0..i.
  let cum = 0;
  const goals = goalProgress(state.goals || [], base.savingsNow).list.map((g) => {
    cum += g.target;
    return { ...g, before: reach(before.balance, cum), after: reach(after.balance, cum) };
  });
  const targets = changes
    .filter((c) => c.type === 'target')
    .map((c) => ({ amount: c.amount, before: reach(before.balance, c.amount), after: reach(after.balance, c.amount) }));

  let afford = null;
  if (purchaseTotal > 0) {
    const lowest = Math.min(...after.balance);
    // One month of normal spending is the cushion we'd like her to keep.
    const cushion = base.avgSpend;
    afford = {
      total: purchaseTotal,
      ok: lowest >= 0,
      thin: lowest >= 0 && lowest < cushion,
      lowest,
      cushion,
      // If she can't now, the first month her savings (without the purchase) cover it
      waitUntil: lowest >= 0 ? null : reach(before.balance, purchaseTotal),
    };
  }

  return {
    base,
    before,
    after,
    afford,
    goals,
    targets,
    thisMonthLeft: { before: base.thisMonthLeft, after: base.thisMonthLeft - purchases.filter((c) => !c.at).reduce((s, c) => s + c.amount, 0) },
    at: (k) => ({ before: before.balance[k], after: after.balance[k] }),
  };
};
