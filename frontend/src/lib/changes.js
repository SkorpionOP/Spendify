import { CATEGORIES } from './categories.js';

/*
 * The one shape a "what if" change may have (see lib/twin.js). Anything coming from outside the app,
 * such as the AI helper, goes through `cleanChanges` so a bad answer can never break the simulator.
 */

export const CHANGE_TYPES = ['purchase', 'save', 'cut', 'income', 'monthly', 'target', 'goal', 'limit', 'expense', 'edit', 'lookup'];
/**
 * Changes that are not simulated. limit/expense/edit change her real data, and only after she taps to
 * confirm; lookup searches her expenses on the phone (the AI only describes what to look for).
 */
export const ACTION_TYPES = ['limit', 'expense', 'edit', 'lookup'];
export const isAction = (c) => ACTION_TYPES.includes(c?.type);
const CATEGORY_NAMES = new Set(CATEGORIES.map((c) => c.name));

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e13 ? Math.round(n) : null;
};
const fraction = (v, { allowNegative = false } = {}) => {
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 1 && Math.abs(n) <= 100) n /= 100; // "15" meant 15%
  if (!allowNegative && n <= 0) return null;
  return Math.abs(n) <= 1 ? n : null;
};
const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = (v) => (typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const categoryOrNull = (v) => (CATEGORY_NAMES.has(v) ? v : null);
/** Which expenses a lookup or an edit is about. Every field is optional; empty means "any". */
const cleanFilter = (c) => {
  let from = isoDate(c.from);
  let to = isoDate(c.to);
  if (from && to && from > to) [from, to] = [to, from];
  return { category: categoryOrNull(c.category), text: text(c.text) || null, from, to, last: c.last === true };
};
const months = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 120 ? n : null;
};

export const cleanChange = (c) => {
  if (!c || !CHANGE_TYPES.includes(c.type)) return null;
  switch (c.type) {
    case 'purchase': {
      const amount = money(c.amount);
      const at = Math.min(12, Math.max(0, Math.round(Number(c.at) || 0)));
      return amount ? { type: 'purchase', amount, name: text(c.name), at, ...(c.estimated === true ? { estimated: true } : {}) } : null;
    }
    case 'save': {
      const amount = money(c.amount);
      return amount ? { type: 'save', amount } : null;
    }
    case 'cut': {
      if (!CATEGORY_NAMES.has(c.category)) return null;
      const pct = c.pct != null ? fraction(c.pct) : null;
      if (pct) return { type: 'cut', category: c.category, pct };
      const amount = money(c.amount);
      return amount ? { type: 'cut', category: c.category, amount } : null;
    }
    case 'income': {
      if (c.set != null && money(c.set)) return { type: 'income', set: money(c.set) };
      if (c.pct != null) {
        const pct = fraction(c.pct, { allowNegative: true });
        if (pct) return { type: 'income', pct };
      }
      const delta = Number(c.delta);
      return Number.isFinite(delta) && delta !== 0 && Math.abs(delta) < 1e13 ? { type: 'income', delta: Math.round(delta) } : null;
    }
    case 'monthly': {
      const amount = money(c.amount);
      return amount ? { type: 'monthly', amount, name: text(c.name), months: months(c.months) } : null;
    }
    case 'target': {
      const amount = money(c.amount);
      return amount ? { type: 'target', amount } : null;
    }
    case 'goal': {
      const amount = money(c.amount);
      return amount ? { type: 'goal', amount, name: text(c.name), months: months(c.months), ...(c.estimated === true ? { estimated: true } : {}) } : null;
    }
    case 'limit': {
      // A monthly cap for one category. No amount means "remove the limit".
      if (!CATEGORY_NAMES.has(c.category)) return null;
      return { type: 'limit', category: c.category, amount: money(c.amount) };
    }
    case 'expense': {
      // Log a real expense (after she confirms). daysAgo: 0 = today, 1 = yesterday.
      const amount = money(c.amount);
      if (!amount) return null;
      const daysAgo = Math.min(60, Math.max(0, Math.round(Number(c.daysAgo) || 0)));
      return { type: 'expense', amount, category: categoryOrNull(c.category), name: text(c.name), daysAgo };
    }
    case 'edit': {
      // Change or delete expenses she already logged. The phone finds them; she picks and confirms.
      const f = cleanFilter(c);
      if (!f.category && !f.text && !f.from && !f.to && !f.last) return null;
      const amount = money(c.amount);
      const toCategory = categoryOrNull(c.toCategory);
      const remove = c.remove === true;
      if (!remove && !amount && !toCategory) return null;
      return { type: 'edit', ...f, remove, amount: remove ? null : amount, toCategory: remove ? null : toCategory };
    }
    case 'lookup': {
      const f = cleanFilter(c);
      if (!f.category && !f.text && !f.from && !f.to && !f.last) return null;
      return { type: 'lookup', ...f, sort: c.sort === 'amount' ? 'amount' : 'date' };
    }
    default:
      return null;
  }
};

export const cleanChanges = (list) => (Array.isArray(list) ? list.slice(0, 10).map(cleanChange).filter(Boolean) : []);
