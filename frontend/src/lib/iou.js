/*
 * IOUs: money she lent to someone, or borrowed from someone. Pure functions, no React.
 *
 * One IOU:
 *   { id, direction: 'lent' | 'borrowed', person, amount, note, date, due: 'YYYY-MM-DD' | null,
 *     payments: [{ id, amount, date }], createdAt }
 * "lent"     = she gave money, the person owes her.
 * "borrowed" = she received money, she owes the person.
 * Payments are money coming back (lent) or paid back (borrowed). An IOU is settled once the payments
 * cover the amount. IOUs are a separate ledger: they never change her budget, expenses or savings.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/** Accepts anything from storage or a backup and returns a clean list. */
export const normalizeDebts = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((d) => d && d.id && num(d.amount) > 0 && typeof d.person === 'string' && d.person.trim())
    .map((d) => ({
      id: d.id,
      direction: d.direction === 'borrowed' ? 'borrowed' : 'lent',
      person: d.person.trim().slice(0, 40),
      amount: num(d.amount),
      note: typeof d.note === 'string' ? d.note.trim().slice(0, 80) : '',
      date: ISO.test(d.date) ? d.date : new Date(d.createdAt || Date.now()).toISOString().slice(0, 10),
      due: ISO.test(d.due) ? d.due : null,
      payments: (Array.isArray(d.payments) ? d.payments : [])
        .filter((p) => p && num(p.amount) > 0)
        .map((p, i) => ({ id: p.id || `${d.id}-p${i}`, amount: num(p.amount), date: ISO.test(p.date) ? p.date : d.date })),
      createdAt: Number(d.createdAt) || 0,
    }));

export const paidOf = (d) => d.payments.reduce((s, p) => s + p.amount, 0);
/** What is still open. Never negative, even if she recorded a little too much. */
export const remainingOf = (d) => Math.max(0, Math.round((d.amount - paidOf(d)) * 100) / 100);
export const isSettled = (d) => remainingOf(d) <= 0;
export const isOverdue = (d, today) => !isSettled(d) && !!d.due && d.due < today;

/** Whole days from today until the due date (negative = overdue). Null without a due date. */
export const daysUntilDue = (d, today) => (d.due ? Math.round((Date.parse(d.due) - Date.parse(today)) / 864e5) : null);

/** Open IOUs first by urgency (overdue, then soonest due, then no due date by oldest), then settled, newest first. */
export const sortDebts = (debts, today) => {
  const rank = (d) => (isSettled(d) ? 3 : isOverdue(d, today) ? 0 : d.due ? 1 : 2);
  return [...debts].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 3) return (b.date > a.date ? 1 : b.date < a.date ? -1 : 0) || b.createdAt - a.createdAt;
    if (ra === 2) return (a.date > b.date ? 1 : a.date < b.date ? -1 : 0) || a.createdAt - b.createdAt;
    return (a.due > b.due ? 1 : a.due < b.due ? -1 : 0) || a.createdAt - b.createdAt;
  });
};

/** Totals for the summary: what people owe her, what she owes, and how many are open or overdue. */
export const debtSummary = (debts, today) => {
  const out = { owedToMe: 0, iOwe: 0, openLent: 0, openBorrowed: 0, overdue: 0, dueSoon: 0, settled: 0 };
  for (const d of debts) {
    const left = remainingOf(d);
    if (left <= 0) {
      out.settled++;
      continue;
    }
    if (d.direction === 'lent') {
      out.owedToMe += left;
      out.openLent++;
    } else {
      out.iOwe += left;
      out.openBorrowed++;
    }
    const days = daysUntilDue(d, today);
    if (days != null && days < 0) out.overdue++;
    else if (days != null && days <= 3) out.dueSoon++;
  }
  out.net = out.owedToMe - out.iOwe;
  out.open = out.openLent + out.openBorrowed;
  return out;
};

/** Names she has used before, most recent first, for one-tap entry. */
export const knownPeople = (debts) => {
  const seen = new Map();
  for (const d of [...debts].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = d.person.toLowerCase();
    if (!seen.has(key)) seen.set(key, d.person);
  }
  return [...seen.values()];
};

/** The balance with one person across all open IOUs: positive = they owe her. */
export const balanceWith = (debts, person) => {
  const key = person.trim().toLowerCase();
  return debts.reduce((s, d) => (d.person.toLowerCase() === key ? s + (d.direction === 'lent' ? 1 : -1) * remainingOf(d) : s), 0);
};
