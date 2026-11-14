/* eslint-disable react-refresh/only-export-components -- small helpers live beside the panels */
import { useState } from 'react';
import { PiggyBank, Plus, Trash2, Wallet } from 'lucide-react';
import { monthSummary, useStore } from '../lib/store';
import { addMonths, currentMonth, daysInMonth, monthLabel, shortDate } from '../lib/dates';
import { currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { CATEGORIES, category as catMeta } from '../lib/categories';
import { catName, getConfig, ordinal, t } from '../lib/i18n';
import { useToast } from './Toasts';
import { CategoryIcon } from './CategoryIcon';

const amountInputMode = () => (getConfig().currency === 'IDR' ? 'numeric' : 'decimal');

/* ---------- extra money ---------- */

export function TopupPanel({ onDone }) {
  const { state, addTopup } = useStore();
  const toast = useToast();
  const summary = monthSummary(state, currentMonth());
  const [amount, setAmount] = useState('');

  const add = (kind) => {
    const v = parseAmountInput(amount);
    if (!(v > 0)) return toast(t('Enter an amount to add.'), { tone: 'warn' });
    addTopup(kind, v);
    setAmount('');
    toast(t(kind === 'needs' ? 'Added {amount} to this month’s budget' : 'Added {amount} to savings', { amount: money(v) }));
    onDone?.();
  };

  return (
    <div className="panel">
      <p className="muted">{t('Got paid extra, a gift, or a refund? Put it where you want it.')}</p>
      <label className="amount-field">
        <span className="sr-only">{t('Amount')}</span>
        <span className="amount-field__symbol" aria-hidden="true">
          {currencySymbol()}
        </span>
        <input
          inputMode={amountInputMode()}
          placeholder="0"
          autoComplete="off"
          value={amount}
          style={{ fontSize: amount.length > 13 ? '1.75rem' : amount.length > 9 ? '2.25rem' : undefined }}
          onChange={(e) => setAmount(formatAmountInput(e.target.value))}
        />
      </label>
      <div className="choice-pair">
        <button type="button" className="choice" onClick={() => add('needs')}>
          <Wallet size={22} />
          <span className="choice__title">{t('Add to budget')}</span>
          <span className="choice__hint">{t('More to spend this month ({amount} now)', { amount: money(summary.budget) })}</span>
        </button>
        <button type="button" className="choice choice--save" onClick={() => add('savings')}>
          <PiggyBank size={22} />
          <span className="choice__title">{t('Add to savings')}</span>
          <span className="choice__hint">{t('Put it away ({amount} now)', { amount: money(summary.leftSavings) })}</span>
        </button>
      </div>
    </div>
  );
}

/* ---------- monthly repeats ---------- */

/** Next date a repeat will be added, as 'YYYY-MM-DD'. */
export const nextRun = (r) => {
  const now = currentMonth();
  const skipped = new Set(r.skippedMonths || []);
  let m = r.lastRun ? addMonths(r.lastRun, 1) : r.since;
  if (m < now) m = now;
  while (skipped.has(m)) {
    m = addMonths(m, 1);
  }
  return `${m}-${String(Math.min(r.day, daysInMonth(m))).padStart(2, '0')}`;
};

export const upcomingRepeats = (recurring) =>
  recurring.map((r) => ({ ...r, next: nextRun(r) })).sort((a, b) => (a.next < b.next ? -1 : 1));

export function RepeatsPanel({ startAdding = false }) {
  const { state, expenses, addRecurring, removeRecurring, toggleSkipRecurring } = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState(startAdding || state.recurring.length === 0);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Rent');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(String(new Date().getDate()));
  const [mandatory, setMandatory] = useState(true);

  const list = upcomingRepeats(state.recurring);
  const monthly = state.recurring.reduce((s, r) => s + r.amount, 0);
  const curMonth = currentMonth();
  const dayNow = new Date().getDate();

  const handleCatChange = (newCat) => {
    setCat(newCat);
    setMandatory(['Rent', 'Bills', 'Phone', 'Health', 'Education'].includes(newCat));
  };

  const submit = (e) => {
    e.preventDefault();
    const v = parseAmountInput(amount);
    if (!(v > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    const d = Number(day);
    const name = note.trim() || catName(cat);
    addRecurring({ amount: v, category: cat, note: note.trim(), day: d, mandatory });
    toast(
      d === dayNow
        ? t('Added {name} for today. It repeats on {day} of each month.', { name, day: ordinal(d) })
        : t('{name} will be added on {day} of each month', { name, day: ordinal(d) })
    );
    setAdding(false);
    setAmount('');
    setNote('');
  };

  return (
    <div className="panel">
      <p className="muted">
        {t('Rent, subscriptions, phone credit: added for you automatically on the same day each month.')}
        {list.length > 0 && ` ${t('{amount} a month in total.', { amount: money(monthly) })}`}
      </p>

      {list.length > 0 && (
        <ul className="tx-list rec-list">
          {list.map((r) => {
            const m = catMeta(r.category);
            const name = r.note || catName(r.category);
            const isMandatory = r.mandatory !== false;
            const isSkippedThisMonth = (r.skippedMonths || []).includes(curMonth);
            const isLoggedThisMonth = expenses.some((e) => e.recurringId === r.id && e.date.slice(0, 7) === curMonth);
            return (
              <li key={r.id} className={`rec ${isSkippedThisMonth ? 'is-skipped' : ''}`}>
                <span className="tx__icon tx__icon--sm" style={{ '--cat': m.color }} aria-hidden="true">
                  <CategoryIcon name={r.category} size={18} color={m.color} />
                </span>
                <span className="tx__body">
                  <span className="tx__title">
                    <span>{name}</span>
                    <span className={`badge badge--sm ${isMandatory ? 'badge--mandatory' : 'badge--flexible'}`}>
                      {isMandatory ? t('Mandatory') : t('Flexible')}
                    </span>
                    {isSkippedThisMonth && <span className="badge badge--sm badge--warn">{t('Skipped')}</span>}
                    {isLoggedThisMonth && !isSkippedThisMonth && <span className="badge badge--sm badge--ok">✓ {t('Paid')}</span>}
                  </span>
                  <span className="tx__meta">
                    {t('{amount} on {day}, next {date}', { amount: money(r.amount), day: ordinal(r.day), date: shortDate(r.next) })}
                  </span>
                </span>
                <div className="rec__tools">
                  <button
                    type="button"
                    className={`btn-skip ${isSkippedThisMonth ? 'is-skipped' : ''}`}
                    onClick={() => {
                      toggleSkipRecurring(r.id);
                      toast(t(isSkippedThisMonth ? 'Resumed {name} for this month' : 'Skipped {name} for this month', { name }));
                    }}
                    title={isSkippedThisMonth ? t('Resume this month') : t('Skip this month')}
                  >
                    {isSkippedThisMonth ? t('Unskip') : t('Skip')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    aria-label={t('Stop repeating {name}', { name })}
                    onClick={() => {
                      if (window.confirm(t('Stop adding {name} every month? Expenses already added stay.', { name }))) {
                        removeRecurring(r.id);
                        toast(t('Repeat stopped'));
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form className="rec-form" onSubmit={submit}>
          <div className="sheet__row sheet__row--even">
            <label className="field">
              <span className="field-label">{t('Name')}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Netflix')} maxLength={60} />
            </label>
            <label className="field">
              <span className="field-label">{t('Amount')}</span>
              <div className="input-prefix">
                <span aria-hidden="true">{currencySymbol()}</span>
                <input inputMode={amountInputMode()} value={amount} onChange={(e) => setAmount(formatAmountInput(e.target.value))} />
              </div>
            </label>
          </div>
          <div className="sheet__row sheet__row--even">
            <label className="field">
              <span className="field-label">{t('Category')}</span>
              <select value={cat} onChange={(e) => handleCatChange(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.emoji} {catName(c.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('Day of month')}</span>
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field">
            <span className="field-label">{t('Commitment')}</span>
            <div className="segmented segmented--2" role="radiogroup">
              <button
                type="button"
                className={mandatory ? 'is-on' : ''}
                onClick={() => setMandatory(true)}
              >
                {t('Mandatory')}
              </button>
              <button
                type="button"
                className={!mandatory ? 'is-on' : ''}
                onClick={() => setMandatory(false)}
              >
                {t('Flexible')}
              </button>
            </div>
            <span className="muted small">
              {mandatory ? t('Essential commitment (rent, bills, debt, school).') : t('Optional service (streaming, gaming, gym).')}
            </span>
          </div>
          <p className="muted small">
            {Number(day) === dayNow
              ? t('Today is the day, so the first one is added right away.')
              : Number(day) < dayNow
                ? t('This month’s date has passed. The first one is added in {month}.', {
                    month: monthLabel(addMonths(currentMonth(), 1), { month: 'long' }),
                  })
                : t('The first one is added later this month.')}
          </p>
          <div className="btn-pair">
            {list.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
                {t('Cancel')}
              </button>
            )}
            <button type="submit" className="btn btn--primary">
              {t('Add repeat')}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn--ghost btn--block" onClick={() => setAdding(true)}>
          <Plus size={18} /> {t('Add a monthly repeat')}
        </button>
      )}
    </div>
  );
}
