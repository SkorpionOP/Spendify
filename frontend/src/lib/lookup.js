/*
 * Finds her expenses for a lookup or an edit from Ask Spendify. Runs only on the phone: the AI describes
 * what to look for (category, words in the note, dates) and never sees the expenses themselves.
 */

const words = (s) =>
  String(s || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** Expenses matching the filter, newest first. `last` keeps only the newest one. */
export const findExpenses = (expenses, f = {}) => {
  const want = words(f.text);
  const out = expenses
    .filter((e) => {
      if (f.category && e.category !== f.category) return false;
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (want.length) {
        const note = String(e.note || '').toLowerCase();
        if (!want.every((w) => note.includes(w))) return false;
      }
      return true;
    })
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  if (f.last) return out.slice(0, 1);
  // Biggest first; the sort is stable, so equal amounts stay newest first
  return f.sort === 'amount' ? out.sort((a, b) => b.amount - a.amount) : out;
};

/**
 * Like findExpenses, but when words in the note match nothing and a category or dates were given,
 * tries again without the words ("kopi" in Coffee, when her coffee notes are empty).
 */
export const findExpensesLoose = (expenses, f = {}) => {
  const strict = findExpenses(expenses, f);
  if (strict.length || !f.text || !(f.category || f.from || f.to)) return strict;
  return findExpenses(expenses, { ...f, text: null });
};

/** Count, total and per-category totals (largest first) for a list of expenses. */
export const summarizeExpenses = (list) => {
  const byCat = {};
  let total = 0;
  for (const e of list) {
    total += e.amount;
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  }
  return {
    count: list.length,
    total,
    byCategory: Object.entries(byCat)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
};
