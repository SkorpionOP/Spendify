/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Delete, PencilLine, Repeat, Trash2, X } from 'lucide-react';
import { CATEGORIES, category as catMeta } from '../lib/categories';
import { addMonths, monthKey, monthLabel, shortDate, toISODate, today } from '../lib/dates';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { CURRENCIES, catName, getConfig, ordinal, t } from '../lib/i18n';
import { previewAfter } from '../lib/budget';
import { useStore } from '../lib/store';
import { useToast } from './Toasts';

const SheetContext = createContext(null);

export function ExpenseSheetProvider({ children }) {
  // undefined = closed, {} = new, {id,…} = edit. A home-screen shortcut (/?add=1) opens it straight away.
  const [editing, setEditing] = useState(() => (new URLSearchParams(window.location.search).has('add') ? {} : undefined));
  const open = useCallback((expense = null) => setEditing(expense || {}), []);
  const close = useCallback(() => setEditing(undefined), []);

  // Keyboard shortcut on desktop: "n" opens a new expense.
  useEffect(() => {
    const onKey = (e) => {
      if (editing !== undefined || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, open]);

  // Tidy the URL after a shortcut launch
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('add')) {
      url.searchParams.delete('add');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, []);

  return (
    <SheetContext.Provider value={open}>
      {children}
      {editing !== undefined && <ExpenseSheet key={editing.id || 'new'} expense={editing} onClose={close} />}
    </SheetContext.Provider>
  );
}

export const useExpenseSheet = () => useContext(SheetContext);

export function useDeleteExpense() {
  const { deleteExpense, restoreExpense } = useStore();
  const toast = useToast();
  return useCallback(
    (id) => {
      const removed = deleteExpense(id);
      if (removed) {
        toast(t('Deleted {amount} {category}', { amount: money(removed.amount), category: catName(removed.category).toLowerCase() }), {
          action: { label: t('Undo'), onClick: () => restoreExpense(removed) },
          duration: 6000,
        });
      }
    },
    [deleteExpense, restoreExpense, toast]
  );
}

const buzz = (ms = 8) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
};

function ExpenseSheet({ expense, onClose }) {
  const { state, expenses, addExpense, updateExpense, addRecurring } = useStore();
  const toast = useToast();
  const remove = useDeleteExpense();
  const isEdit = !!expense.id;
  const usesCents = (CURRENCIES.find((c) => c.code === getConfig().currency)?.decimals ?? 0) > 0;
  const decimalKey = getConfig().locale === 'id-ID' || getConfig().currency === 'IDR' ? ',' : '.';

  const [amount, setAmount] = useState(() => amountToInput(expense.amount));
  const [category, setCategory] = useState(expense.category || expenses[0]?.category || 'Food');
  const [note, setNote] = useState(expense.note || '');
  const [date, setDate] = useState(expense.date || today());
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');
  const amountRef = useRef(null);
  const catsRef = useRef(null);

  const value = parseAmountInput(amount);
  const hasValue = value > 0;
  const isSum = amount.includes('+') && hasValue;

  // Categories she actually uses come first.
  const orderedCats = useMemo(() => {
    const counts = {};
    for (const e of expenses.slice(0, 300)) counts[e.category] = (counts[e.category] || 0) + 1;
    return [...CATEGORIES].sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));
  }, [expenses]);

  // Most-repeated recent expenses, for one-tap entry.
  const quick = useMemo(() => {
    if (isEdit) return [];
    const seen = new Map();
    for (const e of expenses.slice(0, 150)) {
      const k = `${e.category}|${e.note.toLowerCase()}|${e.amount}`;
      const cur = seen.get(k);
      if (cur) cur.n++;
      else seen.set(k, { n: 1, e });
    }
    return [...seen.values()]
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)
      .map((x) => x.e);
  }, [expenses, isEdit]);

  const preview = useMemo(
    () => (hasValue ? previewAfter(state, { amount: value, date, replacingId: expense.id }) : null),
    [state, value, hasValue, date, expense.id]
  );

  useEffect(() => {
    // inputMode="none" keeps the phone keyboard closed; a hardware keyboard still types into the field.
    const timer = setTimeout(() => amountRef.current?.focus({ preventScroll: true }), 80);
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  // Bring the chosen category into view inside its row (never scroll the page).
  useEffect(() => {
    const row = catsRef.current;
    const chip = row?.querySelector('input:checked')?.closest('label');
    if (row && chip) row.scrollLeft = Math.max(0, chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2);
  }, [category]);

  const press = (key) => {
    buzz();
    setError('');
    setAmount((cur) => {
      if (key === 'back') return formatAmountInput(cur.slice(0, -1));
      if (key === '+') return cur && !cur.endsWith('+') ? `${cur}+` : cur;
      if ((key === '000' || key === '00') && (!cur || cur.endsWith('+'))) return cur;
      return formatAmountInput(cur + key);
    });
  };

  const pickQuick = (e) => {
    buzz();
    setAmount(amountToInput(e.amount));
    setCategory(e.category);
    setNote(e.note);
    setError('');
  };

  const submit = (ev) => {
    ev.preventDefault();
    if (!hasValue) {
      setError(amount.trim() ? t('Use numbers only. You can add amounts with +, like 15000+8000.') : t('Enter an amount above zero.'));
      return;
    }
    const v = Math.round(value * 100) / 100;
    buzz(15);
    if (isEdit) {
      updateExpense(expense.id, { amount: v, category, note, date });
      toast(t('Changes saved'));
      onClose();
      return;
    }
    addExpense({ amount: v, category, note, date });
    if (repeat) addRecurring({ amount: v, category, note, day: Number(date.slice(8)), since: addMonths(monthKey(date), 1) });

    if (preview?.fromSavings > 0 && preview.isThisMonth) {
      toast(t('Added. {amount} came out of savings.', { amount: money(preview.fromSavings) }), { tone: 'warn', duration: 5500 });
    } else {
      toast(t('Added {amount} for {category}', { amount: money(v), category: catName(category).toLowerCase() }) + (repeat ? t(', repeats monthly') : ''));
    }
    onClose();
  };

  const isOtherDate = date !== today() && date !== yesterday();
  const saveLabel = isEdit ? t('Save changes') : hasValue ? t('Add {amount}', { amount: money(value, { precise: true }) }) : t('Add expense');

  let previewText = null;
  let previewTone = '';
  if (preview?.hasBudget) {
    if (preview.savingsLeft < 0) {
      previewText = t('preview-short', { amount: money(-preview.savingsLeft) });
      previewTone = 'is-over';
    } else if (preview.fromSavings > 0) {
      previewText = t('preview-over', { amount: money(preview.fromSavings), left: money(preview.savingsLeft) });
      previewTone = 'is-over';
    } else {
      previewText = preview.isThisMonth
        ? t('After this: {amount} left this month', { amount: money(preview.left) })
        : t('After this: {amount} left in {month}', { amount: money(preview.left), month: monthLabel(monthKey(date), { month: 'long' }) });
      if (preview.todayLeft != null) {
        if (preview.todayLeft >= 0) previewText += `, ${t('{amount} left for today', { amount: money(preview.todayLeft) })}`;
        else {
          previewText += `, ${t('{amount} over today’s share', { amount: money(-preview.todayLeft) })}`;
          previewTone = 'is-warn';
        }
      }
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet entry" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onSubmit={submit}>
        <div className="sheet__grip" aria-hidden="true" />

        <header className="entry__head">
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
          <h2 id="sheet-title">{isEdit ? t('Edit expense') : t('New expense')}</h2>
          {isEdit ? (
            <button
              type="button"
              className="icon-btn entry__delete"
              aria-label={t('Delete')}
              onClick={() => {
                remove(expense.id);
                onClose();
              }}
            >
              <Trash2 size={20} />
            </button>
          ) : (
            <span className="entry__spacer" />
          )}
        </header>

        <div className="entry__body">
        {/* Amount */}
        <div className="entry__amount">
          <label className="entry__display">
            <span className="sr-only">{t('Amount')}</span>
            <span className="entry__symbol" aria-hidden="true">
              {currencySymbol()}
            </span>
            <input
              ref={amountRef}
              inputMode="none"
              autoComplete="off"
              placeholder="0"
              value={amount}
              style={{ fontSize: amount.length > 13 ? '1.75rem' : amount.length > 9 ? '2.25rem' : undefined }}
              onChange={(e) => {
                setAmount(formatAmountInput(e.target.value));
                setError('');
              }}
              aria-invalid={!!error}
              aria-describedby="entry-feedback"
            />
            <button type="button" className="entry__plus" onClick={() => press('+')} aria-label="+" disabled={!amount || amount.endsWith('+')}>
              +
            </button>
          </label>
          <p id="entry-feedback" className={`entry__feedback ${error ? 'is-error' : previewTone}`} aria-live="polite">
            {error || (
              <>
                {isSum && <strong>= {money(value, { precise: true })}. </strong>}
                {previewText}
              </>
            )}
          </p>
        </div>

        {quick.length > 0 && !hasValue && (
          <div className="entry__quick" role="group" aria-label={t('Repeat a frequent expense')}>
            {quick.map((e) => (
              <button type="button" key={e.id} className="quick__item" onClick={() => pickQuick(e)}>
                <span aria-hidden="true">{catMeta(e.category).emoji}</span>
                <span className="quick__text">{e.note || catName(e.category)}</span>
                <span className="quick__amt">{money(e.amount)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Category: one swipeable row, most-used first */}
        <fieldset className="entry__cats">
          <legend className="sr-only">{t('Category')}</legend>
          <div className="cats" ref={catsRef}>
            {orderedCats.map((c) => (
              <label key={c.name} className="cat" style={{ '--cat': c.color }}>
                <input type="radio" name="category" value={c.name} checked={category === c.name} onChange={() => setCategory(c.name)} />
                <span className="cat__dot" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="cat__name">{catName(c.name)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Note + when */}
        <div className="entry__meta">
          <label className="entry__note">
            <PencilLine size={18} aria-hidden="true" />
            <span className="sr-only">{t('Note')}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('What was it for?')} maxLength={80} enterKeyHint="done" />
          </label>

          <div className="entry__when" role="group" aria-label={t('Date')}>
            <button type="button" className={`chip ${date === today() ? 'is-on' : ''}`} aria-pressed={date === today()} onClick={() => setDate(today())}>
              {t('Today')}
            </button>
            <button
              type="button"
              className={`chip ${date === yesterday() ? 'is-on' : ''}`}
              aria-pressed={date === yesterday()}
              onClick={() => setDate(yesterday())}
            >
              {t('Yesterday')}
            </button>
            <label className={`chip chip--date ${isOtherDate ? 'is-on' : ''}`}>
              <CalendarDays size={16} aria-hidden="true" />
              <span>{isOtherDate ? shortDate(date) : t('Other date')}</span>
              <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} aria-label={t('Other date')} />
            </label>
            {!isEdit && (
              <button
                type="button"
                className={`chip ${repeat ? 'is-on' : ''}`}
                aria-pressed={repeat}
                onClick={() => setRepeat((r) => !r)}
                title={t('Repeat every month on {day}', { day: ordinal(Number(date.slice(8))) })}
              >
                <Repeat size={15} aria-hidden="true" /> {t('Every month')}
              </button>
            )}
          </div>
          {repeat && <p className="entry__hint">{t('Repeat every month on {day}', { day: ordinal(Number(date.slice(8))) })}</p>}
          {isEdit && expense.recurringId && (
            <p className="entry__hint">{t('Added automatically from a monthly repeat. Manage repeats from Home.')}</p>
          )}
        </div>

        </div>

        {/* Pinned footer: keypad + save are always visible, whatever the phone size */}
        <div className="entry__foot">
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', usesCents ? decimalKey : '000', '0'].map((k) => (
            <button type="button" key={k} className="key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button type="button" className="key key--tool" onClick={() => press('back')} aria-label={t('Delete')}>
            <Delete size={24} />
          </button>
        </div>

        <button type="submit" className="btn btn--primary btn--block entry__submit">
          {saveLabel}
        </button>
        </div>
      </form>
    </div>
  );
}
