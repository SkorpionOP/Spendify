import { CATEGORIES } from './categories.js';

/*
 * The one shape a "what if" change may have (see lib/twin.js). Anything coming from outside the app,
 * such as the AI helper, goes through `cleanChanges` so a bad answer can never break the simulator.
 */

export const CHANGE_TYPES = ['purchase', 'save', 'cut', 'income', 'monthly', 'target', 'goal'];
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
    default:
      return null;
  }
};

export const cleanChanges = (list) => (Array.isArray(list) ? list.slice(0, 10).map(cleanChange).filter(Boolean) : []);
