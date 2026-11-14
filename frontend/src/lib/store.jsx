/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, currentMonth, daysInMonth, monthKey, today } from './dates';
import {
  getSnapshot,
  hasData,
  readLocal,
  readMirror,
  requestPersistence,
  takeSnapshot,
  writeLocal,
  writeMirror,
  LS_KEY,
} from './persist';
import { configure, defaultLang, t } from './i18n';

/*
 * Everything lives on this device. No account, no server.
 *
 * Shape (version 2):
 * {
 *   version: 2,
 *   profile:  { name } | null,
 *   plans:    { 'YYYY-MM': { salary, needsPercent } }   // plan in effect from that month on
 *   topups:   { 'YYYY-MM': { needs, savings } }         // one-off additions for a month
 *   expenses: [{ id, amount, category, note, date, createdAt, recurringId? }]
 *   recurring:[{ id, amount, category, note, day, since: 'YYYY-MM', lastRun: 'YYYY-MM' | null }]
 *   settings: { theme: 'system' | 'light' | 'dark', lang: 'id' | 'en', currency: 'IDR' | … }
 *   startMonth: 'YYYY-MM',
 *   savedAt: ms, lastBackupAt: ms | null
 * }
 */

const empty = () => ({
  version: 2,
  profile: null,
  plans: {},
  topups: {},
  expenses: [],
  recurring: [],
  settings: { theme: 'system', lang: defaultLang(), currency: 'IDR' },
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
  s.recurring = Array.isArray(s.recurring) ? s.recurring : [];
  s.settings = { ...base.settings, ...(s.settings || {}) };
  return s;
};

const uid = () =>
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
export const applyRecurring = (state) => {
  if (!state.recurring?.length) return state;
  const now = currentMonth();
  const dayNow = new Date().getDate();
  const added = [];
  const recurring = state.recurring.map((r) => {
    let m = r.lastRun ? addMonths(r.lastRun, 1) : r.since;
    let lastRun = r.lastRun;
    for (let i = 0; i < 120 && m <= now; i++, m = addMonths(m, 1)) {
      const day = Math.min(r.day, daysInMonth(m));
      if (m === now && day > dayNow) break;
      added.push({
        id: uid(),
        amount: r.amount,
        category: r.category,
        note: r.note,
        date: `${m}-${String(day).padStart(2, '0')}`,
        createdAt: Date.now() + i,
        recurringId: r.id,
      });
      lastRun = m;
    }
    return lastRun === r.lastRun ? r : { ...r, lastRun };
  });
  if (!added.length) return state;
  return { ...state, recurring, expenses: [...added, ...state.expenses] };
};

/* ---------- context ---------- */

const StoreContext = createContext(null);

const readInitial = () => {
  const { state, corrupt } = readLocal();
  return { state: state ? applyRecurring(normalize(state)) : null, corrupt };
};

export function StoreProvider({ children }) {
  const [initial] = useState(readInitial);
  const [state, setStateRaw] = useState(() => initial.state || empty());
  // If localStorage had our data we can render immediately; otherwise check the IndexedDB mirror first.
  const [ready, setReady] = useState(() => hasData(initial.state));
  const [recovered, setRecovered] = useState(null);
  const latest = useRef(state);
  // Language/currency are read by the formatting helpers; keep them in step with settings.
  configure(state.settings);
  const canWrite = useRef(hasData(initial.state));
  const allowEmpty = useRef(false); // set only by "Delete all data"

  const setState = useCallback((updater) => {
    setStateRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      return { ...next, savedAt: Date.now() };
    });
  }, []);

  // Boot: reconcile with the IndexedDB mirror.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mirror = await readMirror();
      if (cancelled) return;
      const local = initial.state;
      if (hasData(mirror) && (!hasData(local) || (mirror.savedAt || 0) > (local.savedAt || 0))) {
        setStateRaw(applyRecurring(normalize(mirror)));
        if (!hasData(local)) {
          setRecovered(
            initial.corrupt
              ? t('Your saved data was damaged, so it was restored from the automatic copy on this device.')
              : t('Your data was restored from the automatic copy on this device.')
          );
        }
      }
      canWrite.current = true;
      setReady(true);
      requestPersistence();
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Persist every change to both stores.
  useEffect(() => {
    latest.current = state;
    if (!canWrite.current || !ready) return;
    const opts = { allowEmpty: allowEmpty.current };
    allowEmpty.current = false;
    writeLocal(state, opts);
    writeMirror(state, opts);
  }, [state, ready]);

  // Flush when the app is backgrounded/closed, and pick up recurring items when it comes back.
  useEffect(() => {
    const flush = () => canWrite.current && writeLocal(latest.current);
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
      else setState((s) => applyRecurring(s));
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [setState]);

  // Keep multiple open tabs in sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== LS_KEY || !e.newValue) return;
      try {
        const incoming = normalize(JSON.parse(e.newValue));
        setStateRaw((cur) => ((incoming.savedAt || 0) >= (cur.savedAt || 0) ? incoming : cur));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* ----- actions ----- */

  const setup = useCallback(
    ({ name, salary, needsPercent }) =>
      setState((s) => ({
        ...s,
        profile: { name: name.trim() },
        startMonth: s.profile ? s.startMonth : currentMonth(),
        plans: { ...s.plans, [currentMonth()]: { salary, needsPercent } },
      })),
    [setState]
  );

  const updateProfile = useCallback((patch) => setState((s) => ({ ...s, profile: { ...s.profile, ...patch } })), [setState]);

  const updateSettings = useCallback((patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), [setState]);

  const updatePlan = useCallback(
    (patch) =>
      setState((s) => {
        const key = currentMonth();
        return { ...s, plans: { ...s.plans, [key]: { ...planFor(s, key), ...patch } } };
      }),
    [setState]
  );

  const addTopup = useCallback(
    (kind, amount) =>
      setState((s) => {
        const key = currentMonth();
        const cur = s.topups[key] || { needs: 0, savings: 0 };
        return { ...s, topups: { ...s.topups, [key]: { ...cur, [kind]: (cur[kind] || 0) + amount } } };
      }),
    [setState]
  );

  const addExpense = useCallback(
    (e) => {
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
    },
    [setState]
  );

  const updateExpense = useCallback(
    (id, patch) =>
      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) =>
          e.id === id ? { ...e, ...patch, amount: Number(patch.amount ?? e.amount), note: (patch.note ?? e.note).trim() } : e
        ),
      })),
    [setState]
  );

  const deleteExpense = useCallback(
    (id) => {
      const removed = latest.current.expenses.find((e) => e.id === id) || null;
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
      return removed;
    },
    [setState]
  );

  const restoreExpense = useCallback(
    (exp) => setState((s) => (s.expenses.some((e) => e.id === exp.id) ? s : { ...s, expenses: [exp, ...s.expenses] })),
    [setState]
  );

  const addRecurring = useCallback(
    ({ amount, category, note, day, since: sinceIn }) => {
      const d = Math.min(31, Math.max(1, Number(day) || 1));
      // If this month's date has already passed, start next month rather than back-filling.
      const since = sinceIn || (d < new Date().getDate() ? addMonths(currentMonth(), 1) : currentMonth());
      setState((s) =>
        applyRecurring({
          ...s,
          recurring: [...s.recurring, { id: uid(), amount: Number(amount), category, note: (note || '').trim(), day: d, since, lastRun: null }],
        })
      );
    },
    [setState]
  );

  const removeRecurring = useCallback(
    (id) => setState((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) })),
    [setState]
  );

  const exportData = useCallback(() => JSON.stringify({ ...latest.current, exportedAt: Date.now() }, null, 2), []);

  const markBackedUp = useCallback(() => setState((s) => ({ ...s, lastBackupAt: Date.now() })), [setState]);

  const importData = useCallback(
    async (text) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(t('This file is not a Spendify backup.'));
      }
      if (!parsed || !Array.isArray(parsed.expenses) || typeof parsed.plans !== 'object') {
        throw new Error(t('This file is not a Spendify backup.'));
      }
      await takeSnapshot(latest.current, 'Before restoring a backup file');
      setState(() => applyRecurring(normalize(parsed)));
    },
    [setState]
  );

  const restoreSnapshot = useCallback(
    async (id) => {
      const snap = await getSnapshot(id);
      if (!snap) throw new Error(t('That copy is no longer available.'));
      await takeSnapshot(latest.current, 'Before restoring an earlier copy');
      setState(() => normalize(snap));
    },
    [setState]
  );

  const resetAll = useCallback(async () => {
    await takeSnapshot(latest.current, 'Before deleting all data');
    allowEmpty.current = true;
    setState(() => empty());
  }, [setState]);

  const clearRecovered = useCallback(() => setRecovered(null), []);

  const expenses = useMemo(
    () => [...state.expenses].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [state.expenses]
  );

  const value = {
    state,
    expenses,
    ready,
    recovered,
    clearRecovered,
    setup,
    updateProfile,
    updateSettings,
    updatePlan,
    addTopup,
    addExpense,
    updateExpense,
    deleteExpense,
    restoreExpense,
    addRecurring,
    removeRecurring,
    exportData,
    markBackedUp,
    importData,
    restoreSnapshot,
    resetAll,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
};
