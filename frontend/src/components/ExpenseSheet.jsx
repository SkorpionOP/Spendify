/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CATEGORIES } from '../lib/categories';
import { currentMonth, monthKey, today } from '../lib/dates';
import { money } from '../lib/format';
import { monthSummary, useStore } from '../lib/store';
import { useToast } from './Toasts';

const SheetContext = createContext(null);

export function ExpenseSheetProvider({ children }) {
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const open = useCallback((expense = null) => setEditing(expense), []);
  const close = useCallback(() => setEditing(undefined), []);

  return (
    <SheetContext.Provider value={open}>
      {children}
      {editing !== undefined && <ExpenseSheet expense={editing} onClose={close} />}
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
        toast(`Deleted ${money(removed.amount)} ${removed.category.toLowerCase()}`, {
          action: { label: 'Undo', onClick: () => restoreExpense(removed) },
          duration: 6000,
        });
      }
    },
    [deleteExpense, restoreExpense, toast]
  );
}

function ExpenseSheet({ expense, onClose }) {
  const { state, addExpense, updateExpense } = useStore();
  const toast = useToast();
  const remove = useDeleteExpense();
  const isEdit = !!expense?.id;

  const [amount, setAmount] = useState(expense?.amount != null ? String(expense.amount) : '');
  const [category, setCategory] = useState(expense?.category || 'Food');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense?.date || today());
  const [error, setError] = useState('');
  const amountRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => amountRef.current?.focus(), 60);
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      setError('Enter an amount above zero.');
      amountRef.current?.focus();
      return;
    }
    if (isEdit) {
      updateExpense(expense.id, { amount: value, category, note, date });
      toast('Changes saved');
    } else {
      // Warn if this one dips into savings
      const before = monthSummary(state, monthKey(date));
      addExpense({ amount: value, category, note, date });
      const overflow = Math.max(0, value - Math.max(0, before?.leftBudget ?? 0));
      if (before && before.budget > 0 && overflow > 0 && monthKey(date) === currentMonth()) {
        toast(`Added. ${money(overflow)} came out of savings.`, { tone: 'warn', duration: 5500 });
      } else {
        toast(`Added ${money(value)} for ${category.toLowerCase()}`);
      }
    }
    onClose();
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={dialogRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onSubmit={submit}
      >
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__head">
          <h2 id="sheet-title">{isEdit ? 'Edit expense' : 'New expense'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <label className="amount-field">
          <span className="sr-only">Amount</span>
          <span className="amount-field__symbol" aria-hidden="true">₹</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'));
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'amount-error' : undefined}
          />
        </label>
        {error && (
          <p id="amount-error" className="field-error">
            {error}
          </p>
        )}

        <fieldset className="cat-picker">
          <legend className="field-label">Category</legend>
          <div className="cat-picker__grid">
            {CATEGORIES.map((c) => (
              <label key={c.name} className="cat-chip" style={{ '--cat': c.color }}>
                <input
                  type="radio"
                  name="category"
                  value={c.name}
                  checked={category === c.name}
                  onChange={() => setCategory(c.name)}
                />
                <span className="cat-chip__emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="cat-chip__name">{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sheet__row">
          <label className="field">
            <span className="field-label">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" maxLength={80} />
          </label>
          <label className="field field--date">
            <span className="field-label">Date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </label>
        </div>

        <div className="sheet__actions">
          {isEdit && (
            <button
              type="button"
              className="btn btn--danger-ghost"
              onClick={() => {
                remove(expense.id);
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="submit" className="btn btn--primary btn--grow">
            {isEdit ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </div>
  );
}
