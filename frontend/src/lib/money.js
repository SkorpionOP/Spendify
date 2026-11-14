import { addMonths, currentMonth, dateInCycle, monthKey, today } from './dates';
import { clampPayday, defaultLang } from './i18n';

/*
 * Pure state + money maths. No React here, so it can be unit tested.
 */

export const empty = () => ({
  version: 2,
  profile: null,
  plans: {},
  topups: {},
  expenses: [],
  recurring: [],
  goals: [], // [{ id, name, target, createdAt }] filled from savings, in list order
  limits: {}, // { Category: monthly cap }
  scenarios: [], // saved "what if" sentences: [{ id, name, text, createdAt }] (never touch real data)
  settings: {
    theme: 'system',
    lang: defaultLang(),
    currency: 'IDR',
    hideAmounts: false,
    notifyRecurring: false,
    trackPayment: false,
    aiHelp: true,
    payday: 1, // day of the month the salary arrives; budget months run from it
  },
  startMonth: currentMonth(),
  savedAt: 0,
  lastBackupAt: null,
});

/** Accepts any older/partial shape and returns a complete, valid state. */
export const normalize = (raw) => {
  const base = empty();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.version = 2;
  s.plans = s.plans && typeof s.plans === 'object' ? s.plans : {};
  s.topups = s.topups && typeof s.topups === 'object' ? s.topups : {};
  s.expenses = Array.isArray(s.expenses)
    ? s.expenses
        .filter((e) => e && Number(e.amount) > 0 && typeof e.date === 'string')
        .map((e) => ({ ...e, amount: Number(e.amount), note: e.note || '', category: e.category || 'Others' }))
    : [];
  s.recurring = Array.isArray(s.recurring)
    ? s.recurring.map((r) => ({
        ...r,
        mandatory: r.mandatory !== false,
        skippedMonths: Array.isArray(r.skippedMonths) ? r.skippedMonths : [],
      }))
    : [];
  s.goals = Array.isArray(s.goals)
    ? s.goals
        .filter((g) => g && g.id && Number(g.target) > 0)
        .map((g) => ({ ...g, name: String(g.name || ''), target: Number(g.target), by: /^\d{4}-\d{2}$/.test(g.by) ? g.by : null }))
    : [];
  s.limits =
    s.limits && typeof s.limits === 'object'
      ? Object.fromEntries(Object.entries(s.limits).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]))
      : {};
  s.scenarios = Array.isArray(s.scenarios) ? s.scenarios.filter((x) => x && x.id && typeof x.text === 'string') : [];
  s.settings = { ...base.settings, ...(s.settings || {}) };
  s.settings.aiHelp = s.settings.aiHelp !== false;
  s.settings.payday = clampPayday(s.settings.payday);
  s.settings.trackPayment = !!s.settings.trackPayment;
  s.settings.hideAmounts = !!s.settings.hideAmounts;
  s.settings.notifyRecurring = !!s.settings.notifyRecurring;
  return s;
};

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/* ---------- budget maths ---------- */

export const planFor = (state, key) => {
  const months = Object.keys(state.plans).sort();
  let found = null;
  for (const m of months) if (m <= key) found = state.plans[m];
  return found || state.plans[months[0]] || { salary: 0, needsPercent: 70 };
};

export const spentIn = (state, key) =>
  state.expenses.reduce((s, e) => (monthKey(e.date) === key ? s + e.amount : s), 0);

/**
 * Walks month by month from the first month to `key`, carrying whatever was left
 * (unspent budget + untouched savings) into the next month's savings pot.
 */
export const monthSummary = (state, key) => {
  const firstExpense = state.expenses.reduce((m, e) => (monthKey(e.date) < m ? monthKey(e.date) : m), key);
  let m = [state.startMonth, firstExpense, key].sort()[0];
  let carry = 0;
  let result = null;

  for (let i = 0; i < 600 && m <= key; i++, m = addMonths(m, 1)) {
    const plan = planFor(state, m);
    const top = state.topups[m] || { needs: 0, savings: 0 };
    const budget = plan.salary * (plan.needsPercent / 100) + (top.needs || 0);
    const savingsBase = plan.salary * ((100 - plan.needsPercent) / 100) + (top.savings || 0);
    const savings = savingsBase + carry;
    const spent = spentIn(state, m);

    const fromBudget = Math.min(spent, budget);
    const fromSavings = Math.max(0, spent - budget);
    const leftBudget = budget - fromBudget;
    const leftSavings = savings - fromSavings;

    result = { month: m, plan, budget, savings, carriedIn: carry, spent, fromSavings, leftBudget, leftSavings, usage: budget > 0 ? spent / budget : 0 };
    carry = Math.max(0, leftBudget + leftSavings);
  }
  return result;
};

/* ---------- recurring ---------- */

/** Adds any recurring expenses that have come due. Returns the same object if nothing changed. */
export const applyRecurring = (state, onAdded = null) => {
  if (!state.recurring?.length) return state;
  const now = currentMonth();
  const todayIso = today();
  const added = [];
  const recurring = state.recurring.map((r) => {
    let m = r.lastRun ? addMonths(r.lastRun, 1) : r.since;
    let lastRun = r.lastRun;
    const skipped = new Set(r.skippedMonths || []);
    for (let i = 0; i < 120 && m <= now; i++, m = addMonths(m, 1)) {
      const date = dateInCycle(m, r.day);
      if (m === now && date > todayIso) break;
      if (!skipped.has(m)) {
        added.push({
          id: uid(),
          amount: r.amount,
          category: r.category,
          note: r.note,
          date,
          createdAt: Date.now() + i,
          recurringId: r.id,
        });
      }
      lastRun = m;
    }
    return lastRun === r.lastRun ? r : { ...r, lastRun };
  });
  if (!added.length) return state;
  if (onAdded) onAdded(added);
  return { ...state, recurring, expenses: [...added, ...state.expenses] };
};


/* ---------- savings goals ---------- */

/**
 * Savings fill the goals one after another, in the order she listed them.
 * Returns each goal with `saved` (0..target), `frac` and `done`, plus whatever is left unassigned.
 */
export const goalProgress = (goals, savings) => {
  let pot = Math.max(0, savings || 0);
  const list = goals.map((g) => {
    const saved = Math.min(g.target, pot);
    pot -= saved;
    return { ...g, saved, frac: g.target > 0 ? saved / g.target : 0, done: saved >= g.target, missing: g.target - saved };
  });
  return { list, spare: pot };
};

/* ---------- category limits ---------- */

/** Spending against each category limit in a month, worst first. `level` is 'ok' | 'near' (80%+) | 'over'. */
export const limitStatus = (state, key, extra = null) => {
  const spent = {};
  for (const e of state.expenses) {
    if (extra?.replacingId && e.id === extra.replacingId) continue;
    if (monthKey(e.date) === key) spent[e.category] = (spent[e.category] || 0) + e.amount;
  }
  if (extra && monthKey(extra.date) === key) spent[extra.category] = (spent[extra.category] || 0) + extra.amount;
  return Object.entries(state.limits || {})
    .map(([cat, limit]) => {
      const used = spent[cat] || 0;
      const frac = limit > 0 ? used / limit : 0;
      return { category: cat, limit, spent: used, left: limit - used, frac, level: frac > 1 ? 'over' : frac >= 0.8 ? 'near' : 'ok' };
    })
    .sort((a, b) => b.frac - a.frac);
};
