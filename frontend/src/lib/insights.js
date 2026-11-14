import { addMonths, cycleDate, cycleEnd, dayOfCycle, daysInMonth, monthKey, toISODate } from './dates';
import { monthSummary } from './money';

/*
 * Everything the Insights page shows for one month, as plain numbers.
 * `now` decides how much of the current month has happened, so it can be tested.
 */

const sum = (list) => list.reduce((s, e) => s + e.amount, 0);

/** Running total per day: [{ day, date, spent, total }] for days 1..upTo. */
const running = (list, key, upTo) => {
  const perDay = new Array(daysInMonth(key)).fill(0);
  for (const e of list) perDay[dayOfCycle(e.date) - 1] += e.amount;
  let run = 0;
  return perDay.slice(0, upTo).map((spent, i) => {
    run += spent;
    return { day: i + 1, date: cycleDate(key, i + 1), spent, total: run };
  });
};

export const monthInsights = (state, key, now = new Date()) => {
  const todayIso = toISODate(now);
  const thisKey = monthKey(todayIso);
  const days = daysInMonth(key);
  // How many days of this month have happened
  const elapsed = key < thisKey ? days : key > thisKey ? 0 : dayOfCycle(todayIso);
  const isCurrent = key === thisKey;

  const list = state.expenses.filter((e) => monthKey(e.date) === key);
  const prevKey = addMonths(key, -1);
  const prevList = state.expenses.filter((e) => monthKey(e.date) === prevKey);
  const total = sum(list);
  const prevTotal = sum(prevList);
  const summary = monthSummary(state, key);
  const budget = summary?.budget || 0;

  const line = running(list, key, Math.max(elapsed, 0));
  const prevDays = daysInMonth(prevKey);
  const prevLine = running(prevList, prevKey, prevDays);
  // Last month at the same point (capped at its own length)
  const sameDay = Math.min(Math.max(elapsed, 1), prevDays);
  const prevAtSameDay = prevList.length ? prevLine[sameDay - 1].total : null;

  // Forecast for the month end: repeats are one-offs, everyday spending continues at its pace.
  let forecast = null;
  if (isCurrent && elapsed >= 3 && elapsed < days) {
    const repeats = sum(list.filter((e) => e.recurringId));
    const everyday = total - repeats;
    forecast = Math.round(repeats + (everyday / elapsed) * days);
  }

  // Categories, with last month for comparison and any limit
  const cats = {};
  for (const e of list) {
    const c = (cats[e.category] ||= { name: e.category, total: 0, count: 0, items: [], prevTotal: 0 });
    c.total += e.amount;
    c.count++;
    c.items.push(e);
  }
  for (const e of prevList) if (cats[e.category]) cats[e.category].prevTotal += e.amount;
  const categories = Object.values(cats)
    .map((c) => ({ ...c, limit: state.limits?.[c.name] || 0, items: c.items.sort((a, b) => b.amount - a.amount) }))
    .sort((a, b) => b.total - a.total);

  // Small habits: the same note bought again and again (3+ times this month)
  const notes = {};
  for (const e of list) {
    const k = (e.note || '').trim().toLowerCase();
    if (!k || e.recurringId) continue;
    const h = (notes[k] ||= { note: e.note.trim(), category: e.category, count: 0, total: 0 });
    h.count++;
    h.total += e.amount;
  }
  const habits = Object.values(notes)
    .filter((h) => h.count >= 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Weekday pattern over the 8 weeks ending at the last day shown, leaving out monthly repeats
  const endIso = isCurrent ? todayIso : cycleEnd(key);
  const end = new Date(Number(endIso.slice(0, 4)), Number(endIso.slice(5, 7)) - 1, Number(endIso.slice(8)));
  const start = new Date(end);
  start.setDate(start.getDate() - 55);
  const startIso = toISODate(start);
  const firstIso = state.expenses.reduce((m, e) => (e.date < m ? e.date : m), endIso);
  const weekdays = Array.from({ length: 7 }, (_, i) => ({ index: i, total: 0, days: 0 })); // 0 = Monday
  for (let d = new Date(start); toISODate(d) <= endIso; d.setDate(d.getDate() + 1)) {
    if (toISODate(d) >= firstIso) weekdays[(d.getDay() + 6) % 7].days++;
  }
  for (const e of state.expenses) {
    if (e.recurringId || e.date < startIso || e.date > endIso) continue;
    const [y, m, dd] = e.date.split('-').map(Number);
    weekdays[(new Date(y, m - 1, dd).getDay() + 6) % 7].total += e.amount;
  }
  for (const w of weekdays) w.avg = w.days ? w.total / w.days : 0;
  const trackedDays = weekdays.reduce((s, w) => s + w.days, 0);
  const peakWeekday = trackedDays >= 14 ? weekdays.reduce((m, w) => (w.avg > m.avg ? w : m)) : null;

  // Payment methods, when she records them
  const pays = {};
  for (const e of list) if (e.pay) pays[e.pay] = (pays[e.pay] || 0) + e.amount;
  const payments = Object.entries(pays)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);

  const shownDays = Math.max(elapsed, 0);
  const spendDays = new Set(list.map((e) => e.date)).size;

  return {
    key,
    prevKey,
    isCurrent,
    days,
    elapsed,
    list,
    total,
    prevTotal,
    budget,
    summary,
    line,
    prevLine,
    prevAtSameDay,
    sameDay,
    forecast,
    categories,
    habits,
    weekdays,
    peakWeekday: peakWeekday && peakWeekday.avg > 0 ? peakWeekday : null,
    payments,
    biggest: list.reduce((m, e) => (!m || e.amount > m.amount ? e : m), null),
    perDay: shownDays ? total / shownDays : 0,
    noSpendDays: Math.max(0, shownDays - spendDays),
  };
};
