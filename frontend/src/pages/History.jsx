import { useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { CATEGORIES } from '../lib/categories';
import { money } from '../lib/format';
import { GroupedExpenses } from '../components/ExpenseList';

const PAGE = 60;

export default function History() {
  const { expenses } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const used = useMemo(() => CATEGORIES.filter((c) => expenses.some((e) => e.category === c.name)), [expenses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (!cat || e.category === cat) &&
        (!needle || e.note.toLowerCase().includes(needle) || e.category.toLowerCase().includes(needle) || String(e.amount).includes(needle))
    );
  }, [expenses, q, cat]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const exportCsv = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Category', 'Note', 'Amount'], ...filtered.map((e) => [e.date, e.category, e.note, e.amount])];
    const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spendify-expenses.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <header className="page__head">
        <h1>History</h1>
        {expenses.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={exportCsv}>
            <Download size={16} /> CSV
          </button>
        )}
      </header>

      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search notes, categories or amounts"
          value={q}
          onChange={(e) => (setQ(e.target.value), setLimit(PAGE))}
          aria-label="Search expenses"
        />
        {q && (
          <button className="icon-btn icon-btn--sm" onClick={() => setQ('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>

      {used.length > 1 && (
        <div className="filter-row" role="group" aria-label="Filter by category">
          <button className={`pill ${!cat ? 'is-on' : ''}`} onClick={() => setCat('')} aria-pressed={!cat}>
            All
          </button>
          {used.map((c) => (
            <button
              key={c.name}
              className={`pill ${cat === c.name ? 'is-on' : ''}`}
              onClick={() => (setCat(cat === c.name ? '' : c.name), setLimit(PAGE))}
              aria-pressed={cat === c.name}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No expenses yet</p>
          <p>Everything you add shows up here, newest first.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty empty--small">
          <p>Nothing matches. Try a different word or category.</p>
        </div>
      ) : (
        <>
          <p className="result-line">
            {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}, {money(total)} in total
          </p>
          <GroupedExpenses expenses={filtered.slice(0, limit)} />
          {filtered.length > limit && (
            <button className="btn btn--ghost btn--block" onClick={() => setLimit(limit + PAGE)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
