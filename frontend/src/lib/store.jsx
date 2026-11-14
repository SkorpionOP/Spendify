/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addMonths, currentMonth, today } from './dates';
import { applyRecurring, empty, normalize, planFor, uid } from './money';
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
import { configure, t } from './i18n';

export { applyRecurring, monthSummary, normalize, planFor, spentIn } from './money';

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
  const [autoAdded, setAutoAdded] = useState([]);
  const clearAutoAdded = useCallback(() => setAutoAdded([]), []);
  const onAutoAdded = useCallback((added) => {
    if (added?.length) setAutoAdded((prev) => [...prev, ...added]);
  }, []);
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
        setStateRaw(applyRecurring(normalize(mirror), onAutoAdded));
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
  }, [initial, onAutoAdded]);

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
      else setState((s) => applyRecurring(s, onAutoAdded));
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [onAutoAdded, setState]);

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
        ...(e.pay ? { pay: e.pay } : {}),
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
    ({ amount, category, note, day, mandatory = true, since: sinceIn }) => {
      const d = Math.min(31, Math.max(1, Number(day) || 1));
      const now = currentMonth();
      const thisDay = new Date().getDate();
      const since = sinceIn || (d < thisDay ? addMonths(now, 1) : now);
      const rule = {
        id: uid(),
        amount: Number(amount),
        category,
        note: (note || '').trim(),
        day: d,
        mandatory: mandatory !== false,
        skippedMonths: [],
        since,
        lastRun: null,
      };
      setState((s) =>
        applyRecurring(
          {
            ...s,
            recurring: [...s.recurring, rule],
          },
          onAutoAdded
        )
      );
      return rule;
    },
    [setState, onAutoAdded]
  );

  const removeRecurring = useCallback(
    (id) => setState((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) })),
    [setState]
  );

  const toggleSkipRecurring = useCallback(
    (id, monthKey = currentMonth()) =>
      setState((s) => {
        const target = s.recurring.find((r) => r.id === id);
        if (!target) return s;
        const skipped = new Set(target.skippedMonths || []);
        const willSkip = !skipped.has(monthKey);
        if (willSkip) skipped.add(monthKey);
        else skipped.delete(monthKey);

        const newRecurring = s.recurring.map((r) => (r.id === id ? { ...r, skippedMonths: [...skipped] } : r));
        let newExpenses = s.expenses;
        if (willSkip) {
          newExpenses = s.expenses.filter((e) => !(e.recurringId === id && e.date.slice(0, 7) === monthKey));
        }

        const nextState = { ...s, recurring: newRecurring, expenses: newExpenses };
        return willSkip ? nextState : applyRecurring(nextState, onAutoAdded);
      }),
    [setState, onAutoAdded]
  );

  const updateRecurring = useCallback(
    (id, patch) =>
      setState((s) => ({
        ...s,
        recurring: s.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),
    [setState]
  );

  /* savings goals */
  const addGoal = useCallback(
    ({ name, target, by = null }) =>
      setState((s) => ({ ...s, goals: [...s.goals, { id: uid(), name: name.trim(), target: Number(target), by, createdAt: Date.now() }] })),
    [setState]
  );
  const updateGoal = useCallback(
    (id, patch) => setState((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
    [setState]
  );
  const removeGoal = useCallback((id) => setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) })), [setState]);
  const moveGoal = useCallback(
    (id, dir) =>
      setState((s) => {
        const i = s.goals.findIndex((g) => g.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.goals.length) return s;
        const goals = [...s.goals];
        [goals[i], goals[j]] = [goals[j], goals[i]];
        return { ...s, goals };
      }),
    [setState]
  );

  /* category limits: amount > 0 sets it, anything else removes it */
  const setLimit = useCallback(
    (cat, amount) =>
      setState((s) => {
        const limits = { ...s.limits };
        if (Number(amount) > 0) limits[cat] = Number(amount);
        else delete limits[cat];
        return { ...s, limits };
      }),
    [setState]
  );

  /* saved "what if" scenarios */
  const saveScenario = useCallback(
    ({ name, text, items = [] }) =>
      setState((s) => ({
        ...s,
        scenarios: [{ id: uid(), name: name.trim(), text: text.trim(), items, createdAt: Date.now() }, ...s.scenarios].slice(0, 20),
      })),
    [setState]
  );
  const removeScenario = useCallback((id) => setState((s) => ({ ...s, scenarios: s.scenarios.filter((x) => x.id !== id) })), [setState]);

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
    autoAddedRecurring: autoAdded,
    clearAutoAdded,
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
    toggleSkipRecurring,
    updateRecurring,
    addGoal,
    updateGoal,
    removeGoal,
    moveGoal,
    setLimit,
    saveScenario,
    removeScenario,
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
