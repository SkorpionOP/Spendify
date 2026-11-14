// All dates are handled as local "YYYY-MM-DD" strings so nothing shifts across timezones.
import { getConfig, t } from './i18n';

const pad = (n) => String(n).padStart(2, '0');
const loc = () => getConfig().locale;

export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const monthKey = (iso) => iso.slice(0, 7);
export const currentMonth = () => monthKey(today());

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

export const addMonths = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const daysInMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

export const monthLabel = (key, opts = { month: 'long', year: 'numeric' }) =>
  parseISO(`${key}-01`).toLocaleDateString(loc(), opts);

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
