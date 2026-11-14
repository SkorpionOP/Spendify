import { catName, getConfig, t } from './i18n';
import { payName } from './payments';

/*
 * Spreadsheet export. Indonesian Excel expects ";" between columns and "," for decimals,
 * so the file follows the app language. A byte-order mark makes Excel read it as UTF-8.
 */
export const buildCsv = (expenses, { lang = getConfig().lang } = {}) => {
  const sep = lang === 'id' ? ';' : ',';
  const num = (n) => (lang === 'id' ? String(n).replace('.', ',') : String(n));
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const withPay = expenses.some((e) => e.pay);
  const head = [t('Date'), t('Category'), t('Note'), ...(withPay ? [t('Paid with')] : []), t('Amount'), t('Monthly repeat')];
  const rows = [...expenses]
    .sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1))
    .map((e) => [
      e.date,
      catName(e.category),
      e.note,
      ...(withPay ? [payName(e.pay)] : []),
      num(e.amount),
      e.recurringId ? t('Yes') : '',
    ]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const totalRow = ['', '', t('Total'), ...(withPay ? [''] : []), num(Math.round(total * 100) / 100), ''];
  return '﻿' + [head, ...rows, totalRow].map((r) => r.map(esc).join(sep)).join('\r\n') + '\r\n';
};

export const saveCsv = async (text, fileName) => {
  const file = new File([text], fileName, { type: 'text/csv' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
};
