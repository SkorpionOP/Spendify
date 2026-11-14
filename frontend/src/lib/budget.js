import { currentMonth, dayOfCycle, daysInMonth, monthKey, today } from './dates';
import { monthSummary } from './money';

/**
 * Plain-language picture of the current month:
 *   left        – budget still unspent this month
 *   allowance   – what today's share was when the day started (left at start of day ÷ days remaining)
 *   todaySpent  – spent so far today
 *   todayLeft   – allowance − todaySpent (negative = over today's share)
 *   status      – 'ok' (at or under the expected pace), 'fast' (ahead of pace), 'over' (budget used up), 'none' (no budget set)
 */
export const monthPicture = (state) => {
  const key = currentMonth();
  const s = monthSummary(state, key);
  const dayOfMonth = dayOfCycle(today());
  const totalDays = daysInMonth(key);
  const daysLeft = totalDays - dayOfMonth + 1; // including today

  const t = today();
  let todaySpent = 0;
  let todayCount = 0;
  for (const e of state.expenses) {
    if (e.date === t) {
      todaySpent += e.amount;
      todayCount++;
    }
  }

  const leftAtStartOfDay = Math.max(0, s.budget - (s.spent - todaySpent));
  const allowance = leftAtStartOfDay / daysLeft;
  const todayLeft = allowance - todaySpent;

  const expectedByNow = s.budget * (dayOfMonth / totalDays);
  let status = 'ok';
  if (s.budget <= 0) status = 'none';
  else if (s.spent > s.budget) status = 'over';
  else if (s.spent > expectedByNow) status = 'fast';

  return {
    ...s,
    left: Math.max(0, s.leftBudget),
    usedFrac: s.budget > 0 ? Math.min(1, s.spent / s.budget) : 0,
    daysLeft,
    allowance,
    todaySpent,
    todayCount,
    todayLeft,
    status,
  };
};

/**
 * What the month looks like if this expense is saved.
 * `replacingId` is set when editing, so the old amount isn't counted twice.
 */
export const previewAfter = (state, { amount, date, replacingId }) => {
  const expenses = state.expenses.filter((e) => e.id !== replacingId);
  const before = { ...state, expenses };
  const after = { ...state, expenses: [...expenses, { id: '__preview__', amount, date, category: '', note: '', createdAt: 0 }] };

  const key = monthKey(date);
  const isThisMonth = key === currentMonth();
  const b = monthSummary(before, key);
  const a = monthSummary(after, key);

  const result = {
    isThisMonth,
    hasBudget: a.budget > 0,
    left: Math.max(0, a.leftBudget),
    // New money taken from savings by this expense alone
    fromSavings: Math.max(0, a.fromSavings - b.fromSavings),
    savingsLeft: a.leftSavings,
    todayLeft: null,
  };

  if (isThisMonth && date === today()) {
    // Today's share is fixed at the start of the day, so use the "before" picture for the allowance.
    const pic = monthPicture(before);
    result.todayLeft = pic.allowance - (pic.todaySpent + amount);
  }
  return result;
};
