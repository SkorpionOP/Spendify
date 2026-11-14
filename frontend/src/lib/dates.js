// All dates are handled as local "YYYY-MM-DD" strings so nothing shifts across timezones.
import { getConfig, t } from './i18n';

const pad = (n) => String(n).padStart(2, '0');
const loc = () => getConfig().locale;

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());

/*
 * Budget months follow her payday. With payday 1 they are calendar months. With payday 25 a
 * "month" runs from the 25th to the 24th of the next month, and is named after the month that holds
 * most of its days: 25 Nov – 24 Dec is "December". Keys stay 'YYYY-MM', so plans, top-ups and
 * skipped repeats keep working unchanged.
 */
const payday = () => getConfig().payday || 1;
// 1 when a cycle is named after the month after the one it starts in (payday after the 15th).
const nameShift = () => (payday() > 15 ? 1 : 0);

export const monthKey = (iso) => {
  const p = payday();
  const cal = iso.slice(0, 7);
  if (p === 1) return cal;
  return addMonths(cal, (Number(iso.slice(8, 10)) >= p ? 0 : -1) + nameShift());
};
export const currentMonth = () => monthKey(today());

/** True when months follow a payday other than the 1st. */
export const isPayCycle = () => payday() !== 1;

const addDaysISO = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

/** First day of the budget month `key`, e.g. '2026-11-25' for December with payday 25. */
export const cycleStart = (key) => `${addMonths(key, -nameShift())}-${pad(payday())}`;
/** Last day of the budget month `key`. */
export const cycleEnd = (key) => addDaysISO(cycleStart(addMonths(key, 1)), -1);
/** Date of day `n` (1-based) of the budget month `key`. */
export const cycleDate = (key, n) => addDaysISO(cycleStart(key), n - 1);
/** Which day of its budget month a date is (1-based). */
export const dayOfCycle = (iso) => Math.round((parseISO(iso) - parseISO(cycleStart(monthKey(iso)))) / 864e5) + 1;

/** The date in budget month `key` that falls on day-of-month `dom` (rent on the 1st, etc.). */
export const dateInCycle = (key, dom) => {
  const start = cycleStart(key);
  const cal = dom >= payday() ? start.slice(0, 7) : addMonths(start.slice(0, 7), 1);
  const [y, m] = cal.split('-').map(Number);
  return `${cal}-${pad(Math.min(dom, new Date(y, m, 0).getDate()))}`;
};

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

export const addMonths = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** Number of days in the budget month `key`. */
export const daysInMonth = (key) => Math.round((parseISO(cycleStart(addMonths(key, 1))) - parseISO(cycleStart(key))) / 864e5);

export const monthLabel = (key, opts = { month: 'long', year: 'numeric' }) =>
  parseISO(`${key}-01`).toLocaleDateString(loc(), opts);

/** "25 Nov – 24 Des" for a pay cycle; null for plain calendar months. */
export const cycleRange = (key) => {
  if (!isPayCycle()) return null;
  const f = (iso) => parseISO(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  return `${f(cycleStart(key))} – ${f(cycleEnd(key))}`;
};

/** "12 Nov" / "12 Nov 2025" */
export const shortDate = (iso) => {
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
};

export const dateTime = (ms) =>
  new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const dayLabel = (iso) => {
  if (iso === today()) return t('Today');
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (iso === toISODate(y)) return t('Yesterday');
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(loc(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 4) return t('Still up');
  if (h < 11) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
};

/** The budget period today falls in for a given payday, e.g. "25 Nov – 24 Des" (before it is saved). */
export const periodPreview = (payday, now = new Date()) => {
  const p = payday || 1;
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = now.getDate() >= p ? new Date(y, m, p) : new Date(y, m - 1, p);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, p - 1);
  const f = (d) => d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
};
