import { CATEGORIES } from './categories.js';

/*
 * The one shape a scanned receipt may have. Whatever the AI read goes through cleanReceipt, so a bad
 * answer can never put nonsense into the expense form. Shared by the server (api/understand.js) and
 * the app; imports only files with explicit .js extensions so it runs on Vercel as-is.
 */

// Same ids as lib/payments.js (that file needs i18n, which the server can't load)
export const PAYMENT_IDS = ['cash', 'gopay', 'ovo', 'dana', 'shopeepay', 'bank', 'credit'];
const CATEGORY_NAMES = new Set(CATEGORIES.map((c) => c.name));

/** "35.000" / "Rp 1.250.000,50" (Indonesian) or "1,250.50" (English) → a number. */
const parseAmountText = (v) => {
  const s = v.replace(/[^\d.,]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(',', '.'));
};

const amountOf = (v) => {
  const n = typeof v === 'string' ? parseAmountText(v) : Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n * 100) / 100 : null;
};
const textOf = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** YYYY-MM-DD that is a real date, not in the future (one day of slack for time zones), within ~2 years. */
const dateOf = (v, today) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const diff = (d.getTime() - t) / 864e5;
  return diff <= 1 && diff >= -730 ? v : null;
};

export const cleanReceipt = (r, today = new Date().toISOString().slice(0, 10)) => {
  if (!r || typeof r !== 'object') return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .map((it) => ({ name: textOf(it?.name, 40), amount: amountOf(it?.amount) }))
    .filter((it) => it.name)
    .slice(0, 15);
  return {
    isReceipt: r.isReceipt !== false,
    amount: amountOf(r.amount),
    merchant: textOf(r.merchant, 40),
    note: textOf(r.note, 60),
    date: dateOf(r.date, today),
    category: CATEGORY_NAMES.has(r.category) ? r.category : null,
    payment: PAYMENT_IDS.includes(r.payment) ? r.payment : null,
    items,
  };
};
