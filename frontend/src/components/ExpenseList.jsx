import { RefreshCw } from 'lucide-react';
import { category } from '../lib/categories';
import { dayLabel } from '../lib/dates';
import { money } from '../lib/format';
import { catName, t } from '../lib/i18n';
import { CategoryIcon } from './CategoryIcon';
import { useExpenseSheet } from './ExpenseSheet';

export function ExpenseRow({ expense, showDate = false }) {
  const open = useExpenseSheet();
  const c = category(expense.category);
  const name = catName(expense.category);
  const isRepeat = !!expense.recurringId;

  return (
    <li>
      <button className="tx" onClick={() => open(expense)} aria-label={t('Edit {category} {amount}', { category: name, amount: money(expense.amount) })}>
        <span className="tx__icon" style={{ '--cat': c.color }} aria-hidden="true">
          <CategoryIcon name={expense.category} size={20} color={c.color} />
        </span>
        <span className="tx__body">
          <span className="tx__title">
            {expense.note || name}
            {isRepeat && (
              <span className="tx__repeat-badge" title={t('Monthly repeat')}>
                <RefreshCw size={10} aria-hidden="true" />
              </span>
            )}
          </span>
          <span className="tx__meta">
            {expense.note ? name : ''}
            {expense.note && showDate ? ', ' : ''}
            {showDate ? dayLabel(expense.date) : ''}
          </span>
        </span>
        <span className="tx__amount">{money(expense.amount, { precise: true })}</span>
      </button>
    </li>
  );
}

/** Groups a newest-first list of expenses by day. */
export function GroupedExpenses({ expenses }) {
  const groups = [];
  for (const e of expenses) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return (
    <div className="groups">
      {groups.map((g) => (
        <section key={g.date} className="group">
          <h3 className="group__head">
            <span>{dayLabel(g.date)}</span>
            <span className="group__total">{money(g.items.reduce((s, e) => s + e.amount, 0))}</span>
          </h3>
          <ul className="tx-list">
            {g.items.map((e) => (
              <ExpenseRow key={e.id} expense={e} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
