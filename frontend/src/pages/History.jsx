import { useMemo, useState } from 'react';
import { FileSpreadsheet, Search, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { CATEGORIES } from '../lib/categories';
import { money } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { GroupedExpenses } from '../components/ExpenseList';
import { CategoryIcon } from '../components/CategoryIcon';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toasts';
import { payName } from '../lib/payments';
import { buildCsv, saveCsv } from '../lib/csv';
import { monthKey, monthLabel } from '../lib/dates';

const PAGE = 60;

export default function History() {
  const { expenses } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const used = useMemo(() => CATEGORIES.filter((c) => expenses.some((e) => e.category === c.name)), [expenses]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (!cat || e.category === cat) &&
        (!needle ||
          e.note.toLowerCase().includes(needle) ||
          e.category.toLowerCase().includes(needle) ||
          catName(e.category).toLowerCase().includes(needle) ||
          (e.pay && payName(e.pay).toLowerCase().includes(needle)) ||
          String(e.amount).includes(needle.replace(/[.,\s]/g, '')))
    );
  }, [expenses, q, cat]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // Months with expenses, newest first, for the spreadsheet export.
  const months = useMemo(() => {
    const m = new Map();
    for (const e of expenses) {
      const k = monthKey(e.date);
      const cur = m.get(k) || { key: k, count: 0, total: 0 };
      cur.count++;
      cur.total += e.amount;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [expenses]);

  const exportRows = async (rows, name) => {
    const ok = await saveCsv(buildCsv(rows), `spendify-${name}.csv`);
    if (ok) {
      toast(t('Spreadsheet saved'));
      setExporting(false);
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <h1>{t('History')}</h1>
        {expenses.length > 0 && (
          <button className="btn btn--ghost btn--sm" onClick={() => setExporting(true)}>
            <FileSpreadsheet size={16} /> {t('Excel')}
          </button>
        )}
      </header>

      {exporting && (
        <Sheet title={t('Save as spreadsheet')} onClose={() => setExporting(false)}>
          <div className="panel">
            <p className="muted">{t('export-help')}</p>
            <ul className="export-list">
              {(q || cat) && filtered.length > 0 && (
                <li>
                  <button className="export-item" onClick={() => exportRows(filtered, 'search')}>
                    <span className="export-item__name">{t('What you searched for')}</span>
                    <span className="export-item__meta private-num">
                      {tn(filtered.length, '{n} expense', '{n} expenses')}, {money(total)}
                    </span>
                  </button>
                </li>
              )}
              {months.map((m) => (
                <li key={m.key}>
                  <button className="export-item" onClick={() => exportRows(expenses.filter((e) => monthKey(e.date) === m.key), m.key)}>
                    <span className="export-item__name">{monthLabel(m.key)}</span>
                    <span className="export-item__meta private-num">
                      {tn(m.count, '{n} expense', '{n} expenses')}, {money(m.total)}
                    </span>
                  </button>
                </li>
              ))}
              {months.length > 1 && (
                <li>
                  <button className="export-item" onClick={() => exportRows(expenses, 'all')}>
                    <span className="export-item__name">{t('Everything')}</span>
                    <span className="export-item__meta">{tn(expenses.length, '{n} expense', '{n} expenses')}</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        </Sheet>
      )}

      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          placeholder={t('Search notes, categories or amounts')}
          value={q}
          onChange={(e) => (setQ(e.target.value), setLimit(PAGE))}
          aria-label={t('Search expenses')}
        />
        {q && (
          <button className="icon-btn icon-btn--sm" onClick={() => setQ('')} aria-label={t('Clear search')}>
            <X size={16} />
          </button>
        )}
      </div>

      {used.length > 1 && (
        <div className="filter-row" role="group" aria-label={t('Filter by category')}>
          <button className={`pill ${!cat ? 'is-on' : ''}`} onClick={() => setCat('')} aria-pressed={!cat}>
            {t('All')}
          </button>
          {used.map((c) => (
            <button
              key={c.name}
              className={`pill ${cat === c.name ? 'is-on' : ''}`}
              onClick={() => (setCat(cat === c.name ? '' : c.name), setLimit(PAGE))}
              aria-pressed={cat === c.name}
            >
              <CategoryIcon name={c.name} size={15} color={cat === c.name ? '#ffffff' : c.color} /> {catName(c.name)}
            </button>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{t('No expenses yet')}</p>
          <p>{t('Everything you add shows up here, newest first.')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty empty--small">
          <p>{t('Nothing matches. Try a different word or category.')}</p>
        </div>
      ) : (
        <>
          <p className="result-line">
            {t('{count}, {amount} in total', { count: tn(filtered.length, '{n} expense', '{n} expenses'), amount: money(total) })}
          </p>
          <GroupedExpenses expenses={filtered.slice(0, limit)} />
          {filtered.length > limit && (
            <button className="btn btn--ghost btn--block" onClick={() => setLimit(limit + PAGE)}>
              {t('Show more')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
