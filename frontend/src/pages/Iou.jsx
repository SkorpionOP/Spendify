import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronUp, HandCoins, PencilLine, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { useBackClose } from '../lib/backclose';
import { addDaysISO, dayLabel, shortDate, today } from '../lib/dates';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { t, tn } from '../lib/i18n';
import { balanceWith, daysUntilDue, debtSummary, isSettled, knownPeople, paidOf, remainingOf, sortDebts } from '../lib/iou';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toasts';

/*
 * IOUs: who owes her, and who she owes. A separate list: nothing here changes the budget or savings.
 * Open ones come first, most urgent on top. Tap one to record a payment, send a reminder, edit or delete.
 */

const initial = (name) => (name.trim()[0] || '?').toUpperCase();

/** "Overdue by 3 days" / "Due today" / "Due in 2 days" / "Due 20 Nov" */
const dueText = (d, day) => {
  const n = daysUntilDue(d, day);
  if (n == null) return null;
  if (n < 0) return { tone: 'bad', text: tn(-n, 'Overdue by {n} day', 'Overdue by {n} days') };
  if (n === 0) return { tone: 'warn', text: t('Due today') };
  if (n <= 3) return { tone: 'warn', text: tn(n, 'Due in {n} day', 'Due in {n} days') };
  return { tone: '', text: t('Due {date}', { date: shortDate(d.due) }) };
};

export default function Iou() {
  const { state } = useStore();
  const hidden = !!state.settings.hideAmounts;
  const day = today();
  const debts = state.debts;
  const sum = useMemo(() => debtSummary(debts, day), [debts, day]);
  const sorted = useMemo(() => sortDebts(debts, day), [debts, day]);
  const [filter, setFilter] = useState('all'); // all | lent | borrowed
  const [showSettled, setShowSettled] = useState(false);

  // One sheet at a time: { kind: 'edit', debt } (new when debt has no id) or { kind: 'view', id }
  const [panel, setPanel] = useState(null);
  const onClosed = useCallback(() => setPanel(null), []);
  const { markOpen, requestClose } = useBackClose(panel !== null, onClosed);
  const open = (p) => {
    if (!panel) markOpen();
    setPanel(p);
  };

  const both = sum.openLent > 0 && sum.openBorrowed > 0;
  const kind = both ? filter : 'all';
  const openList = sorted.filter((d) => !isSettled(d) && (kind === 'all' || d.direction === kind));
  const settled = sorted.filter(isSettled);
  const viewing = panel?.kind === 'view' ? debts.find((d) => d.id === panel.id) : null;

  return (
    <div className={`page iou ${hidden ? 'is-private' : ''}`}>
      <header className="page__head iou__head">
        <Link to="/" className="icon-btn iou__back" aria-label={t('Back to home')}>
          <ChevronLeft size={22} />
        </Link>
        <h1>{t('iou-title')}</h1>
        {debts.length > 0 && (
          <button className="btn btn--primary btn--sm iou__new" onClick={() => open({ kind: 'edit', debt: {} })}>
            <Plus size={16} strokeWidth={2.5} /> {t('New')}
          </button>
        )}
      </header>

      {debts.length === 0 ? (
        <div className="empty iou__empty">
          <span className="iou__empty-icon" aria-hidden="true">
            <HandCoins size={30} />
          </span>
          <p className="empty__title">{t('No IOUs yet')}</p>
          <p>{t('iou-empty')}</p>
          <div className="iou__empty-actions">
            <button className="btn btn--primary" onClick={() => open({ kind: 'edit', debt: { direction: 'lent' } })}>
              <ArrowUpRight size={18} /> {t('I lent money')}
            </button>
            <button className="btn btn--ghost" onClick={() => open({ kind: 'edit', debt: { direction: 'borrowed' } })}>
              <ArrowDownLeft size={18} /> {t('I borrowed money')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="iou__summary" aria-label={t('Summary')}>
            <div className="iou__tile iou__tile--in">
              <p className="iou__tile-label">
                <ArrowDownLeft size={15} aria-hidden="true" /> {t('Owed to you')}
              </p>
              <p className="iou__tile-num private-num">{money(sum.owedToMe)}</p>
              <p className="iou__tile-hint">{sum.openLent ? tn(sum.openLent, '{n} open IOU', '{n} open IOUs') : t('Nothing open')}</p>
            </div>
            <div className="iou__tile iou__tile--out">
              <p className="iou__tile-label">
                <ArrowUpRight size={15} aria-hidden="true" /> {t('You owe')}
              </p>
              <p className="iou__tile-num private-num">{money(sum.iOwe)}</p>
              <p className="iou__tile-hint">{sum.openBorrowed ? tn(sum.openBorrowed, '{n} open IOU', '{n} open IOUs') : t('Nothing open')}</p>
            </div>
          </section>

          {sum.overdue > 0 && (
            <p className="iou__alert" role="status">
              <BellRing size={16} aria-hidden="true" /> {tn(sum.overdue, '{n} IOU is past its due date', '{n} IOUs are past their due date')}
            </p>
          )}

          {both && (
            <div className="segmented" role="group" aria-label={t('Show')}>
              {[
                ['all', t('All')],
                ['lent', t('Owed to you')],
                ['borrowed', t('You owe')],
              ].map(([k, label]) => (
                <button key={k} type="button" className={filter === k ? 'is-on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {openList.length > 0 ? (
            <ul className="iou__list">
              {openList.map((d) => (
                <DebtRow key={d.id} debt={d} day={day} onOpen={() => open({ kind: 'view', id: d.id })} />
              ))}
            </ul>
          ) : (
            <div className="iou__clear">
              <Check size={18} aria-hidden="true" /> {t('All settled. Nothing open right now.')}
            </div>
          )}

          {settled.length > 0 && (
            <section className="section">
              <button className="iou__toggle" onClick={() => setShowSettled((v) => !v)} aria-expanded={showSettled}>
                <span>{t('Settled ({n})', { n: settled.length })}</span>
                {showSettled ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
              {showSettled && (
                <ul className="iou__list">
                  {settled.map((d) => (
                    <DebtRow key={d.id} debt={d} day={day} onOpen={() => open({ kind: 'view', id: d.id })} />
                  ))}
                </ul>
              )}
            </section>
          )}

          <p className="iou__foot">{t('iou-foot')}</p>
        </>
      )}

      {panel?.kind === 'edit' && (
        <Sheet title={panel.debt.id ? t('Edit IOU') : t('New IOU')} onClose={requestClose}>
          <DebtEditor debt={panel.debt} onDone={(saved) => (panel.debt.id && saved ? setPanel({ kind: 'view', id: saved.id }) : requestClose())} />
        </Sheet>
      )}
      {panel?.kind === 'view' && viewing && (
        <Sheet title={viewing.person} onClose={requestClose}>
          <DebtDetail debt={viewing} day={day} onEdit={() => setPanel({ kind: 'edit', debt: viewing })} onClose={requestClose} />
        </Sheet>
      )}
    </div>
  );
}

function DebtRow({ debt: d, day, onOpen }) {
  const left = remainingOf(d);
  const paid = paidOf(d);
  const done = left <= 0;
  const due = done ? null : dueText(d, day);
  return (
    <li>
      <button className={`debt is-${d.direction} ${done ? 'is-done' : ''}`} onClick={onOpen}>
        <span className="debt__avatar" aria-hidden="true">
          {done ? <Check size={18} /> : initial(d.person)}
        </span>
        <span className="debt__body">
          <span className="debt__name">{d.person}</span>
          <span className="debt__meta">
            {done ? t('Settled') : d.direction === 'lent' ? t('owes you') : t('you owe')}
            {d.note ? ` · ${d.note}` : ''}
          </span>
          {due && <span className={`debt__due ${due.tone ? `is-${due.tone}` : ''}`}>{due.text}</span>}
          {!done && paid > 0 && (
            <span className="debt__progress">
              <span className="goal__bar" aria-hidden="true">
                <span style={{ '--w': `${Math.min(100, (paid / d.amount) * 100)}%` }} />
              </span>
              <span className="debt__progress-text private-num">{t('{paid} of {total} paid back', { paid: money(paid), total: money(d.amount) })}</span>
            </span>
          )}
        </span>
        <span className="debt__amount private-num">{money(done ? d.amount : left)}</span>
      </button>
    </li>
  );
}

/** Add or edit an IOU. Big, plain choices; names she used before are one tap. */
function DebtEditor({ debt, onDone }) {
  const { state, addDebt, updateDebt } = useStore();
  const toast = useToast();
  const isEdit = !!debt.id;
  const [direction, setDirection] = useState(debt.direction || 'lent');
  const [person, setPerson] = useState(debt.person || '');
  const [amount, setAmount] = useState(() => amountToInput(debt.amount || ''));
  const [note, setNote] = useState(debt.note || '');
  const [date, setDate] = useState(debt.date || today());
  const [due, setDue] = useState(debt.due || '');
  const people = useMemo(() => knownPeople(state.debts).filter((p) => p.toLowerCase() !== person.trim().toLowerCase()).slice(0, 5), [state.debts, person]);
  const value = parseAmountInput(amount);
  const yesterday = addDaysISO(today(), -1);
  const DUE = [
    ['', t('No due date')],
    [addDaysISO(today(), 7), t('In 1 week')],
    [addDaysISO(today(), 14), t('In 2 weeks')],
    [addDaysISO(today(), 30), t('In 1 month')],
  ];
  const customDue = due && !DUE.some(([v]) => v === due);

  const save = (e) => {
    e.preventDefault();
    if (!person.trim()) return toast(direction === 'lent' ? t('Who did you lend to?') : t('Who did you borrow from?'), { tone: 'warn' });
    if (!(value > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    const fields = { direction, person: person.trim(), amount: value, note: note.trim(), date, due: due || null };
    if (isEdit) {
      updateDebt(debt.id, fields);
      toast(t('Changes saved'));
      onDone({ id: debt.id });
    } else {
      addDebt(fields);
      toast(direction === 'lent' ? t('Saved: {person} owes you {amount}', { person: fields.person, amount: money(value) }) : t('Saved: you owe {person} {amount}', { person: fields.person, amount: money(value) }));
      onDone(null);
    }
  };

  return (
    <form className="panel iou-form" onSubmit={save}>
      <div className="segmented segmented--2" role="group" aria-label={t('Kind')}>
        <button type="button" className={direction === 'lent' ? 'is-on' : ''} aria-pressed={direction === 'lent'} onClick={() => setDirection('lent')}>
          {t('I lent')}
        </button>
        <button type="button" className={direction === 'borrowed' ? 'is-on' : ''} aria-pressed={direction === 'borrowed'} onClick={() => setDirection('borrowed')}>
          {t('I borrowed')}
        </button>
      </div>

      <label className="field">
        <span className="field-label">{direction === 'lent' ? t('Who did you lend to?') : t('Who did you borrow from?')}</span>
        <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder={t('Name')} maxLength={40} autoFocus={!isEdit} autoComplete="off" enterKeyHint="next" />
      </label>
      {people.length > 0 && !isEdit && (
        <div className="iou-form__chips" role="group" aria-label={t('People')}>
          {people.map((p) => (
            <button type="button" key={p} className="chip" onClick={() => setPerson(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <label className="field">
        <span className="field-label">{t('How much?')}</span>
        <div className="input-prefix">
          <span aria-hidden="true">{currencySymbol()}</span>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(formatAmountInput(e.target.value))} placeholder="200.000" autoComplete="off" />
        </div>
      </label>

      <label className="field">
        <span className="field-label">
          {t('What for?')} <span className="muted">({t('optional')})</span>
        </span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. lunch, concert ticket')} maxLength={80} />
      </label>

      <div className="field">
        <span className="field-label">{t('When?')}</span>
        <div className="iou-form__chips" role="group" aria-label={t('When?')}>
          <button type="button" className={`chip ${date === today() ? 'is-on' : ''}`} aria-pressed={date === today()} onClick={() => setDate(today())}>
            {t('Today')}
          </button>
          <button type="button" className={`chip ${date === yesterday ? 'is-on' : ''}`} aria-pressed={date === yesterday} onClick={() => setDate(yesterday)}>
            {t('Yesterday')}
          </button>
          <label className={`chip chip--date ${date !== today() && date !== yesterday ? 'is-on' : ''}`}>
            <CalendarDays size={16} aria-hidden="true" />
            <span>{date !== today() && date !== yesterday ? shortDate(date) : t('Other date')}</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} aria-label={t('Other date')} />
          </label>
        </div>
      </div>

      <div className="field">
        <span className="field-label">{direction === 'lent' ? t('Pay back by') : t('Pay it back by')}</span>
        <div className="iou-form__chips" role="group" aria-label={t('Due date')}>
          {DUE.map(([v, label]) => (
            <button type="button" key={label} className={`chip ${due === v ? 'is-on' : ''}`} aria-pressed={due === v} onClick={() => setDue(v)}>
              {label}
            </button>
          ))}
          <label className={`chip chip--date ${customDue ? 'is-on' : ''}`}>
            <CalendarDays size={16} aria-hidden="true" />
            <span>{customDue ? shortDate(due) : t('Pick a date')}</span>
            <input type="date" value={due} min={date} onChange={(e) => setDue(e.target.value)} aria-label={t('Pick a date')} />
          </label>
        </div>
      </div>

      <button className="btn btn--primary btn--block" type="submit">
        {isEdit ? t('Save changes') : t('Save IOU')}
      </button>
    </form>
  );
}

/** One IOU: what is left, the payments so far, and what she can do next. */
function DebtDetail({ debt: d, day, onEdit, onClose }) {
  const { state, addDebtPayment, removeDebtPayment, deleteDebt, restoreDebt } = useStore();
  const toast = useToast();
  const left = remainingOf(d);
  const paid = paidOf(d);
  const done = left <= 0;
  const lent = d.direction === 'lent';
  const [value, setValue] = useState(() => amountToInput(left));
  const amount = parseAmountInput(value);
  const due = done ? null : dueText(d, day);
  const balance = balanceWith(state.debts, d.person);
  const others = state.debts.filter((x) => x.id !== d.id && x.person.toLowerCase() === d.person.toLowerCase() && !isSettled(x)).length;

  const record = (e) => {
    e.preventDefault();
    if (!(amount > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    const pay = Math.min(amount, left);
    const p = addDebtPayment(d.id, pay);
    const rest = Math.max(0, left - pay);
    setValue(amountToInput(rest));
    toast(rest <= 0 ? t('All settled with {person} 🎉', { person: d.person }) : t('Recorded {amount}. {left} to go.', { amount: money(pay), left: money(rest) }), {
      action: { label: t('Undo'), onClick: () => removeDebtPayment(d.id, p.id) },
      duration: 6000,
    });
  };

  const undoPayment = (p) => {
    removeDebtPayment(d.id, p.id);
    setValue(amountToInput(left + p.amount));
  };

  const remind = async () => {
    const text = t('iou-reminder', { person: d.person, amount: money(left), note: d.note ? ` (${d.note})` : '' });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast(t('Reminder copied. Paste it in a chat.'));
    } catch (err) {
      if (err?.name !== 'AbortError') toast(t('Couldn’t share. Copy the amount and send it yourself.'), { tone: 'warn' });
    }
  };

  const remove = () => {
    const removed = deleteDebt(d.id);
    onClose();
    if (removed) toast(t('IOU deleted'), { action: { label: t('Undo'), onClick: () => restoreDebt(removed) }, duration: 6000 });
  };

  return (
    <div className={`panel iou-detail is-${d.direction}`}>
      <div className="iou-detail__hero">
        <p className="iou-detail__label">{done ? t('Settled') : lent ? t('{person} owes you', { person: d.person }) : t('You owe {person}', { person: d.person })}</p>
        <p className="iou-detail__num private-num">{money(done ? d.amount : left)}</p>
        {due && <p className={`debt__due ${due.tone ? `is-${due.tone}` : ''}`}>{due.text}</p>}
        {paid > 0 && !done && (
          <div className="iou-detail__progress">
            <span className="goal__bar" aria-hidden="true">
              <span style={{ '--w': `${Math.min(100, (paid / d.amount) * 100)}%` }} />
            </span>
            <span className="muted small private-num">{t('{paid} of {total} paid back', { paid: money(paid), total: money(d.amount) })}</span>
          </div>
        )}
      </div>

      {!done && (
        <form className="iou-pay" onSubmit={record}>
          <label className="field-label" htmlFor="iou-pay">
            {lent ? t('Got some back?') : t('Paid some back?')}
          </label>
          <div className="price-ask__row">
            <div className="input-prefix">
              <span aria-hidden="true">{currencySymbol()}</span>
              {/* Tapping selects the whole amount, so typing a part payment replaces it */}
              <input id="iou-pay" inputMode="numeric" value={value} onChange={(e) => setValue(formatAmountInput(e.target.value))} onFocus={(e) => e.target.select()} autoComplete="off" />
            </div>
            <button type="submit" className="btn btn--primary" disabled={!(amount > 0)}>
              <Check size={18} aria-hidden="true" /> {amount >= left ? t('Settle') : t('Record')}
            </button>
          </div>
          <p className="muted small">{amount >= left ? t('iou-pay-full') : t('iou-pay-part', { left: money(left - amount) })}</p>
        </form>
      )}

      <dl className="detail__rows">
        <div className="detail__row">
          <dt>{lent ? t('You lent') : t('You borrowed')}</dt>
          <dd className="private-num">{money(d.amount)}</dd>
        </div>
        <div className="detail__row">
          <dt>{t('Date')}</dt>
          <dd>{dayLabel(d.date)}</dd>
        </div>
        {d.due && (
          <div className="detail__row">
            <dt>{t('Due date')}</dt>
            <dd>{dayLabel(d.due)}</dd>
          </div>
        )}
        {d.note && (
          <div className="detail__row">
            <dt>{t('What for?')}</dt>
            <dd>{d.note}</dd>
          </div>
        )}
        {others > 0 && (
          <div className="detail__row">
            <dt>{t('All IOUs with {person}', { person: d.person })}</dt>
            <dd className="private-num">{balance >= 0 ? t('owes you {amount}', { amount: money(balance) }) : t('you owe {amount}', { amount: money(-balance) })}</dd>
          </div>
        )}
      </dl>

      {d.payments.length > 0 && (
        <section className="iou-detail__payments" aria-label={t('Payments')}>
          <h3>{t('Payments')}</h3>
          <ul>
            {d.payments.map((p) => (
              <li key={p.id}>
                <span>{dayLabel(p.date)}</span>
                <span className="private-num">{money(p.amount)}</span>
                <button type="button" className="icon-btn icon-btn--sm" onClick={() => undoPayment(p)} aria-label={t('Remove this payment')}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="iou-detail__actions">
        {lent && !done && (
          <button type="button" className="btn btn--ghost" onClick={remind}>
            <BellRing size={18} aria-hidden="true" /> {t('Remind')}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onEdit}>
          <PencilLine size={18} aria-hidden="true" /> {t('Edit')}
        </button>
        <button type="button" className="btn btn--ghost iou-detail__delete" onClick={remove}>
          <Trash2 size={18} aria-hidden="true" /> {t('Delete')}
        </button>
      </div>
    </div>
  );
}
