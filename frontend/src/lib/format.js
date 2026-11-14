import { CURRENCIES, getConfig } from './i18n';

// Rupiah always reads "Rp 25.000" (Indonesian style), even when the UI is in English.
const numLocale = () => (getConfig().currency === 'IDR' ? 'id-ID' : getConfig().locale);

const cache = new Map();
const nf = (key, opts) => {
  const { currency } = getConfig();
  const locale = numLocale();
  const k = `${locale}|${currency}|${key}`;
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(locale, { style: 'currency', currency, ...opts }));
  return cache.get(k);
};

const decimals = () => CURRENCIES.find((c) => c.code === getConfig().currency)?.decimals ?? 2;

/** Rp 25.000 / $12.50 — whole units unless `precise` and the currency uses cents. */
export const money = (n, { precise = false } = {}) => {
  const v = Number(n) || 0;
  const d = precise ? decimals() : 0;
  const s = nf(`m${d}`, { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Math.abs(v));
  return v < 0 ? `−${s}` : s;
};

/** Short form for tight spaces: Rp 25 rb, Rp 1,2 jt / $1.2K */
export const compact = (n) => {
  const v = Math.abs(Number(n) || 0);
  return nf('c', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
};

/** Shortest representation for calendar tiles and badges: e.g. "605k", "1.2M", "500" */
export const calCompact = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (!v) return '';
  const { lang, currency } = getConfig();
  const isId = lang === 'id' || currency === 'IDR';
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) {
    const k = v / 1000;
    const str = k >= 100 || k % 1 === 0 ? String(Math.round(k)) : k.toFixed(1).replace(/\.0$/, '');
    return `${str}k`;
  }
  if (v < 1_000_000_000) {
    const m = v / 1_000_000;
    const str = m >= 100 || m % 1 === 0 ? String(Math.round(m)) : m.toFixed(1).replace(/\.0$/, '');
    return `${str}${isId ? 'jt' : 'M'}`;
  }
  const b = v / 1_000_000_000;
  const str = b >= 100 || b % 1 === 0 ? String(Math.round(b)) : b.toFixed(1).replace(/\.0$/, '');
  return `${str}${isId ? 'M' : 'B'}`;
};

/** The bare symbol, e.g. "Rp" or "$" */
export const currencySymbol = () =>
  nf('sym', { maximumFractionDigits: 0 })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value || getConfig().currency;

/** Thousands separator for the active locale ("." in Indonesian, "," in English). */
const groupSep = () =>
  new Intl.NumberFormat(numLocale()).formatToParts(10000).find((p) => p.type === 'group')?.value || ',';
const decimalSep = () =>
  new Intl.NumberFormat(numLocale()).formatToParts(1.5).find((p) => p.type === 'decimal')?.value || '.';

/**
 * Formats what the user is typing into an amount box, keeping "+" sums:
 * "25000+8000" → "25.000+8.000" (id) / "25,000+8,000" (en).
 */
export const formatAmountInput = (raw) => {
  const g = groupSep();
  const dsep = decimalSep();
  const allowDec = decimals() > 0;
  const cleaned = raw.replace(new RegExp(`[^0-9+${allowDec ? '\\' + dsep : ''}]`, 'g'), '').replace(/\++/g, '+');
  return cleaned
    .split('+')
    .map((part) => {
      if (!part) return part;
      const [int, ...rest] = allowDec ? part.split(dsep) : [part];
      const frac = rest.join('').slice(0, decimals());
      const intFmt = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, g);
      return allowDec && part.includes(dsep) ? `${intFmt}${dsep}${frac}` : intFmt;
    })
    .join('+');
};

/** Parses formatted input back to a number; supports "+" sums. NaN if invalid/empty. */
export const parseAmountInput = (text) => {
  const g = groupSep();
  const dsep = decimalSep();
  const t = (text || '').split(g).join('').trim();
  if (!t) return NaN;
  const parts = t.split('+').filter(Boolean);
  if (!parts.length) return NaN;
  let sum = 0;
  for (const p of parts) {
    const v = parseFloat(p.replace(dsep, '.'));
    if (Number.isNaN(v)) return NaN;
    sum += v;
  }
  return sum;
};

/** For pre-filling an input from a stored number. */
export const amountToInput = (n) => {
  if (n == null || n === '') return '';
  const d = decimals();
  const s = d > 0 ? String(Math.round(Number(n) * 100) / 100).replace('.', decimalSep()) : String(Math.round(Number(n)));
  return formatAmountInput(s);
};

/** Tiny label for charts: "22rb", "1,5jt" in Indonesian, "22k", "1.5M" in English. No currency symbol. */
export const tinyAmount = (n) => {
  const v = Math.abs(Number(n) || 0);
  const id = getConfig().lang === 'id';
  const fmt = (x) => {
    const s = x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
    return id ? s.replace('.', ',') : s;
  };
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) return fmt(v / 1000) + (id ? 'rb' : 'k');
  return fmt(v / 1_000_000) + (id ? 'jt' : 'M');
};

/** Rounds to a friendly amount for sentences: nearest 1.000 for Rupiah, whole units otherwise. */
export const roundNice = (n) => (getConfig().currency === 'IDR' ? Math.round(n / 1000) * 1000 : Math.round(n));
