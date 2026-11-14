import { addMonths, monthKey, toISODate } from './dates';
import { monthSummary } from './money';

/*
 * Look-backs shown on Home: one for the month that just ended (first 7 days of a month)
 * and one for last week (Monday to Wednesday). Pure functions of state + "now", so they can be tested.
 */

/** The month that just ended, if it is worth showing. */
export const monthRecap = (state, now = new Date()) => {
  if (now.getDate() > 7) return null;
  const prevKey = addMonths(monthKey(toISODate(now)), -1);
  if (state.startMonth > prevKey) return null;
  const m = monthSummary(state, prevKey);
  if (!m || m.month !== prevKey || m.budget <= 0 || m.spent <= 0) return null;
  return { ...m, key: prevKey };
};

const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

/** Monday of the week containing `d`. */
export const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** Last Monday–Sunday compared with the week before it. Shown Monday to Wednesday. */
export const weekRecap = (state, now = new Date()) => {
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  if (dow > 2) return null;
  const thisWeek = weekStart(now);
  const from = toISODate(addDays(thisWeek, -7));
  const to = toISODate(addDays(thisWeek, -1));
  const prevFrom = toISODate(addDays(thisWeek, -14));

  let spent = 0;
  let prevSpent = 0;
  let count = 0;
  const days = new Set();
  const byCat = {};
  for (const e of state.expenses) {
    if (e.date >= from && e.date <= to) {
      spent += e.amount;
      count++;
      days.add(e.date);
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    } else if (e.date >= prevFrom && e.date < from) {
      prevSpent += e.amount;
    }
  }
  if (!count) return null;
  const [topCat, topAmount] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  return {
    key: from,
    from,
    to,
    spent,
    count,
    prevSpent,
    // Change vs the week before, as a fraction (−0.2 = spent 20% less). Null when there's nothing to compare.
    change: prevSpent > 0 ? (spent - prevSpent) / prevSpent : null,
    topCat,
    topAmount,
    noSpendDays: 7 - days.size,
  };
};
