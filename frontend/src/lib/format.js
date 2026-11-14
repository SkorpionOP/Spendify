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
