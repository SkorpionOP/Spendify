import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PencilLine, Receipt, Search, X } from 'lucide-react';
import { CATEGORIES } from '../lib/categories';
import { dayLabel, shortDate, toISODate } from '../lib/dates';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { detectCategoryFromNote } from '../lib/guesscat';
import { findExpensesLoose as findExpenses, summarizeExpenses } from '../lib/lookup';
import { useStore } from '../lib/store';
import { useToast } from './Toasts';
import { useDeleteExpense } from './ExpenseSheet';
import { ExpenseRow } from './ExpenseList';

/*
 * Cards Ask Spendify shows under a reply. Logging, changing or deleting an expense happens only when
 * she taps the button, and every change can be undone from the toast. Lookups search her expenses on
 * this phone; the AI never sees them.
 */

const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - (Number(n) || 0));
  return toISODate(d);
};

function CardHead({ icon: Icon, title, onClose, closable = true }) {
  return (
    <div className="plan__head">
      <span className="plan__icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <h2 className="plan__title">{title}</h2>
      {closable && (
        <button type="button" className="icon-btn icon-btn--sm limit-ask__close" onClick={onClose} aria-label={t('Not now')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** "Log Makan warteg, Rp 35.000?": editable before she taps Add. */
export function ExpenseCard({ ask, onClose }) {
  const { addExpense, deleteExpense } = useStore();
  const toast = useToast();
  const [value, setValue] = useState(() => amountToInput(ask.amount || ''));
  const [cat, setCat] = useState(() => ask.category || detectCategoryFromNote(ask.name) || 'Others');
  const [note, setNote] = useState(() => (ask.name ? ask.name.charAt(0).toUpperCase() + ask.name.slice(1) : ''));
  const [added, setAdded] = useState(null);
  const date = daysAgoISO(ask.daysAgo);
  const amount = parseAmountInput(value);

  const undo = (exp) => {
    deleteExpense(exp.id);
    setAdded(null);
  };
  const apply = (e) => {
    e.preventDefault();
    if (!(amount > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    const exp = addExpense({ amount, category: cat, note, date });
    setAdded(exp);
    toast(t('Added {amount} for {category}', { amount: money(amount), category: catName(cat) }), {
      action: { label: t('Undo'), onClick: () => undo(exp) },
      duration: 6000,
    });
  };

  return (
    <form className="plan limit-ask chat-card" onSubmit={apply} aria-label={t('Add this expense?')}>
      <CardHead icon={Receipt} title={added ? t('Expense added') : t('Add this expense?')} onClose={onClose} closable={!added} />
      {added ? (
        <p className="plan__done private-num">
          <Check size={16} aria-hidden="true" /> {note || catName(cat)}, {money(added.amount)}, {dayLabel(date).toLowerCase()}.{' '}
          <button type="button" className="link-btn" onClick={() => undo(added)}>
            {t('Undo')}
          </button>
        </p>
      ) : (
        <>
          <div className="chat-card__fields">
            <input className="chat-card__note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note')} aria-label={t('Note')} maxLength={60} />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('Category')}>
              {CATEGORIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.emoji} {catName(c.name)}
                </option>
              ))}
            </select>
          </div>
          <p className="plan__line muted small">{dayLabel(date)}</p>
          <div className="price-ask__row">
            <div className="input-prefix">
              <span aria-hidden="true">{currencySymbol()}</span>
              <input inputMode="numeric" value={value} onChange={(e) => setValue(formatAmountInput(e.target.value))} aria-label={t('Amount')} />
            </div>
            <button type="submit" className="btn btn--primary" disabled={!(amount > 0)}>
              {t('Add')}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

/** "Change which expense?": the matches found on the phone, one tap each. */
export function EditCard({ ask, onClose }) {
  const { expenses, updateExpense } = useStore();
  const del = useDeleteExpense();
  const toast = useToast();
  const [done, setDone] = useState([]); // ids already changed here
  const matches = useMemo(() => findExpenses(expenses, ask).slice(0, 5), [expenses, ask]);
  const open = matches.filter((e) => !done.includes(e.id));

  const what = ask.remove
    ? t('Delete')
    : ask.amount && ask.toCategory
      ? t('Change to {amount}, {category}', { amount: money(ask.amount), category: catName(ask.toCategory) })
      : ask.amount
        ? t('Change to {amount}', { amount: money(ask.amount) })
        : t('Move to {category}', { category: catName(ask.toCategory) });

  const apply = (e) => {
    setDone((d) => [...d, e.id]);
    if (ask.remove) return del(e.id);
    const before = { amount: e.amount, category: e.category, note: e.note };
    updateExpense(e.id, { ...(ask.amount ? { amount: ask.amount } : {}), ...(ask.toCategory ? { category: ask.toCategory } : {}) });
    toast(t('Changes saved'), {
      action: {
        label: t('Undo'),
        onClick: () => {
          updateExpense(e.id, before);
          setDone((d) => d.filter((x) => x !== e.id));
        },
      },
      duration: 6000,
    });
  };

  const title = ask.remove ? (matches.length === 1 ? t('Delete this expense?') : t('Delete which expense?')) : matches.length === 1 ? t('Change this expense?') : t('Change which expense?');

  return (
    <section className="plan limit-ask chat-card" aria-label={title}>
      <CardHead icon={PencilLine} title={done.length && !open.length ? t('Done') : title} onClose={onClose} />
      {!matches.length && !done.length ? (
        <p className="plan__line">
          {t('I couldn’t find a matching expense.')}{' '}
          <Link to="/history" className="link-btn">
            {t('Open History')}
          </Link>
        </p>
      ) : (
        <>
          {done.length > 0 && (
            <p className="plan__done">
              <Check size={16} aria-hidden="true" /> {tn(done.length, '{n} expense updated', '{n} expenses updated')}
            </p>
          )}
          {open.length > 0 && (
            <ul className="chat-card__matches">
              {open.map((e) => (
                <li key={e.id} className="chat-card__match">
                  <span className="chat-card__match-text private-num">
                    <strong>{e.note || catName(e.category)}</strong>
                    <span className="muted small">
                      {money(e.amount)}, {catName(e.category)}, {dayLabel(e.date)}
                    </span>
                  </span>
                  <button type="button" className={`btn ${ask.remove ? 'btn--danger' : 'btn--primary'} btn--sm`} onClick={() => apply(e)}>
                    {what}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const rangeLabel = (from, to) => {
  if (from && to) return from === to ? dayLabel(from) : `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return t('since {date}', { date: shortDate(from) });
  if (to) return t('until {date}', { date: shortDate(to) });
  return '';
};

/** What she asked about, found on this phone: the list and the total. */
export function LookupCard({ ask, onClose }) {
  const { expenses } = useStore();
  const [all, setAll] = useState(false);
  const found = useMemo(() => findExpenses(expenses, ask), [expenses, ask]);
  const sum = summarizeExpenses(found);
  const shown = found.slice(0, all ? 50 : 6);
  const title = [ask.category ? catName(ask.category) : null, ask.text ? `“${ask.text}”` : null, rangeLabel(ask.from, ask.to)].filter(Boolean).join(', ') || t('Your expenses');

  return (
    <section className="plan limit-ask chat-card chat-card--lookup" aria-label={title}>
      <CardHead icon={Search} title={title} onClose={onClose} />
      {!found.length ? (
        <p className="plan__line">{t('No expenses found for this.')}</p>
      ) : (
        <>
          <p className="plan__line private-num">
            <strong>{money(sum.total)}</strong> · {tn(sum.count, '{n} expense', '{n} expenses')}
            {!ask.category && sum.byCategory.length > 1 && (
              <span className="muted small chat-card__cats">
                {sum.byCategory
                  .slice(0, 3)
                  .map((c) => `${catName(c.category)} ${money(c.amount)}`)
                  .join(' · ')}
              </span>
            )}
          </p>
          <ul className="tx-list private-num">
            {shown.map((e) => (
              <ExpenseRow key={e.id} expense={e} showDate />
            ))}
          </ul>
          {found.length > shown.length &&
            (all ? (
              <Link to="/history" className="link-btn chat-card__more">
                {t('{n} more in History', { n: found.length - shown.length })}
              </Link>
            ) : (
              <button type="button" className="link-btn chat-card__more" onClick={() => setAll(true)}>
                {t('Show all {n}', { n: Math.min(found.length, 50) })}
              </button>
            ))}
        </>
      )}
    </section>
  );
}
