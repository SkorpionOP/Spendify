import { t } from './i18n';

// Stored by `id`; brand names are shown as-is, the rest are translated.
export const PAYMENTS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gopay', label: 'GoPay', brand: true },
  { id: 'ovo', label: 'OVO', brand: true },
  { id: 'dana', label: 'DANA', brand: true },
  { id: 'shopeepay', label: 'ShopeePay', brand: true },
  { id: 'bank', label: 'Bank / debit' },
  { id: 'credit', label: 'Credit card' },
];

const byId = Object.fromEntries(PAYMENTS.map((p) => [p.id, p]));

export const payName = (id) => {
  const p = byId[id];
  if (!p) return '';
  return p.brand ? p.label : t(p.label);
};
