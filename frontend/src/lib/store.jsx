/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { addMonths, currentMonth, monthKey, today } from './dates';

/*
 * Everything lives in this browser's localStorage under one key. No account, no server.
 *
 * Shape:
 * {
 *   version: 1,
 *   profile:  { name } | null,
 *   plans:    { 'YYYY-MM': { salary, needsPercent } }   // plan in effect from that month on
 *   topups:   { 'YYYY-MM': { needs, savings } }         // one-off additions for a month
 *   expenses: [{ id, amount, category, note, date, createdAt }]
 *   startMonth: 'YYYY-MM'
 * }
 */

const KEY = 'spendify:v1';

const empty = () => ({
  version: 1,
  profile: null,
  plans: {},
  topups: {},
  expenses: [],
  startMonth: currentMonth(),
});

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
};

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);

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

  // Guard against absurd ranges
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

    result = {
      month: m,
      plan,
      budget,
      savings,
      carriedIn: carry,
      spent,
      fromSavings,
      leftBudget,
      leftSavings,
      usage: budget > 0 ? spent / budget : 0,
    };
    carry = Math.max(0, leftBudget + leftSavings);
  }
  return result;
};

/* ---------- context ---------- */

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save', e);
    }
  }, [state]);

  // Keep multiple open tabs in sync
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setState(load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Ask the browser not to evict our data under storage pressure
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const setup = useCallback(({ name, salary, needsPercent }) => {
    setState((s) => ({
      ...s,
      profile: { name: name.trim() },
      startMonth: s.profile ? s.startMonth : currentMonth(),
      plans: { ...s.plans, [currentMonth()]: { salary, needsPercent } },
    }));
  }, []);

  const updateProfile = useCallback((patch) => {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  }, []);

  const updatePlan = useCallback((patch) => {
    setState((s) => {
      const key = currentMonth();
      const next = { ...planFor(s, key), ...patch };
      return { ...s, plans: { ...s.plans, [key]: next } };
    });
  }, []);

  const addTopup = useCallback((kind, amount) => {
    setState((s) => {
      const key = currentMonth();
      const cur = s.topups[key] || { needs: 0, savings: 0 };
      return { ...s, topups: { ...s.topups, [key]: { ...cur, [kind]: (cur[kind] || 0) + amount } } };
    });
  }, []);

  const addExpense = useCallback((e) => {
    const exp = {
      id: uid(),
      amount: Number(e.amount),
      category: e.category,
      note: (e.note || '').trim(),
      date: e.date || today(),
      createdAt: Date.now(),
    };
    setState((s) => ({ ...s, expenses: [exp, ...s.expenses] }));
    return exp;
  }, []);

  const updateExpense = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      expenses: s.expenses.map((e) =>
        e.id === id ? { ...e, ...patch, amount: Number(patch.amount ?? e.amount), note: (patch.note ?? e.note).trim() } : e
      ),
    }));
  }, []);

  const deleteExpense = useCallback(
    (id) => {
      const removed = state.expenses.find((e) => e.id === id) || null;
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
      return removed;
    },
    [state.expenses]
  );

  const restoreExpense = useCallback((exp) => {
    setState((s) => (s.expenses.some((e) => e.id === exp.id) ? s : { ...s, expenses: [exp, ...s.expenses] }));
  }, []);

  const exportData = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const importData = useCallback((text) => {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.expenses) || typeof parsed.plans !== 'object') {
      throw new Error('This file is not a Spendify backup.');
    }
    setState({ ...empty(), ...parsed });
  }, []);

  const resetAll = useCallback(() => setState(empty()), []);

  // Newest first, stable
  const expenses = useMemo(
    () =>
      [...state.expenses].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [state.expenses]
  );

  const value = {
    state,
    expenses,
    setup,
    updateProfile,
    updatePlan,
    addTopup,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    exportData,
    importData,
    resetAll,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
};
