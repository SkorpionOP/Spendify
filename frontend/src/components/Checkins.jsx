import { useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { CATEGORIES, category as catMeta } from '../lib/categories';
import { catName, getConfig, t } from '../lib/i18n';
import { CategoryIcon } from './CategoryIcon';
import { useToast } from './Toasts';

/*
 * Daily check-ins: things she pays for most days but not at a fixed price (bike fuel, lunch, parking).
 * On the days she picked, Home asks "Filled up your bike today?" once; "Yes" logs it with the amount.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WORKDAYS = [0, 1, 2, 3, 4];

const IDEAS = [
  { key: 'checkin-fuel', category: 'Transport', amount: 25000 },
  { key: 'checkin-lunch', category: 'Food', amount: 25000 },
  { key: 'checkin-parking', category: 'Transport', amount: 2000 },
  { key: 'checkin-coffee', category: 'Coffee', amount: 15000 },
];

// Quick amounts for Rupiah; other currencies just use the box.
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const quickAmounts = () => (getConfig().currency === 'IDR' ? [10000, 20000, 30000, 50000] : []);

/** The question card on Home. */
export function CheckinCard({ checkin }) {
  const { answerCheckin, deleteExpense, reopenCheckin } = useStore();
  const toast = useToast();
  const [yes, setYes] = useState(false);
  const [value, setValue] = useState(() => amountToInput(checkin.amount || ''));
  const amount = parseAmountInput(value);
  const meta = catMeta(checkin.category);

  const save = (e) => {
    e.preventDefault();
    if (!(amount > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    const exp = answerCheckin(checkin.id, amount);
    toast(t('Logged: {name} {amount}', { name: checkin.name, amount: money(amount) }), {
      action: {
        label: t('Undo'),
        onClick: () => {
          deleteExpense(exp.id);
          reopenCheckin(checkin.id);
        },
      },
    });
  };

  return (
    <section className="checkin" aria-label={checkin.name}>
      <span className="checkin__icon" style={{ '--cat': meta.color }} aria-hidden="true">
        <CategoryIcon name={checkin.category} size={20} color={meta.color} />
      </span>
      <div className="checkin__body">
        <p className="checkin__q">{t('checkin-question', { name: lowerFirst(checkin.name) })}</p>
        {!yes ? (
          <div className="checkin__btns">
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setYes(true)}>
              <Check size={16} /> {t('Yes')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => answerCheckin(checkin.id, null)}>
              {t('Not today')}
            </button>
          </div>
        ) : (
          <form className="checkin__form" onSubmit={save}>
            <div className="checkin__row">
              <div className="input-prefix">
                <span aria-hidden="true">{currencySymbol()}</span>
                <input
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => setValue(formatAmountInput(e.target.value))}
                  aria-label={t('How much?')}
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn--primary" disabled={!(amount > 0)}>
                {t('Save price')}
              </button>
            </div>
            {quickAmounts().length > 0 && (
              <div className="checkin__quick" role="group" aria-label={t('Ideas')}>
                {quickAmounts().map((q) => (
                  <button key={q} type="button" className={`chip ${amount === q ? 'is-on' : ''}`} onClick={() => setValue(amountToInput(q))}>
                    {money(q)}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
      </div>
      {!yes && (
        <button type="button" className="icon-btn icon-btn--sm checkin__close" onClick={() => answerCheckin(checkin.id, null)} aria-label={t('Not today')}>
          <X size={16} />
        </button>
      )}
    </section>
  );
}

/** List and add daily check-ins. Lives in the Repeats sheet. */
export function CheckinsPanel() {
  const { state, addCheckin, removeCheckin } = useStore();
  const toast = useToast();
  const list = state.checkins || [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [cat, setCat] = useState('Transport');
  const [value, setValue] = useState('');
  const [days, setDays] = useState(WORKDAYS);

  const pickIdea = (idea) => {
    setName(t(idea.key));
    setCat(idea.category);
    if (getConfig().currency === 'IDR') setValue(amountToInput(idea.amount));
  };
  const toggleDay = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return toast(t('Give it a name.'), { tone: 'warn' });
    if (!days.length) return toast(t('Pick at least one day.'), { tone: 'warn' });
    addCheckin({ name: name.trim(), category: cat, amount: parseAmountInput(value) || 0, days });
    toast(t('Spendify will ask about {name} when you open the app.', { name: name.trim() }));
    setAdding(false);
    setName('');
    setValue('');
    setDays(WORKDAYS);
  };

  const dayText = (d) => (d.length === 7 ? t('Every day') : d.join() === WORKDAYS.join() ? t('Mon–Fri') : d.map((x) => t(WEEKDAYS[x])).join(', '));

  return (
    <div className="panel">
      <p className="muted">{t('checkin-intro')}</p>
      {list.length > 0 && (
        <ul className="tx-list rec-list">
          {list.map((c) => {
            const m = catMeta(c.category);
            return (
              <li key={c.id} className="rec">
                <span className="tx__icon tx__icon--sm" style={{ '--cat': m.color }} aria-hidden="true">
                  <CategoryIcon name={c.category} size={18} color={m.color} />
                </span>
                <span className="tx__body">
                  <span className="tx__title">{c.name}</span>
                  <span className="tx__meta private-num">
                    {dayText(c.days)}
                    {c.amount > 0 ? ` · ${t('last {amount}', { amount: money(c.amount) })}` : ''}
                  </span>
                </span>
                <button className="icon-btn icon-btn--sm" onClick={() => removeCheckin(c.id)} aria-label={t('Stop asking about {name}', { name: c.name })}>
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding || list.length === 0 ? (
        <form className="checkin-add" onSubmit={submit}>
          <div className="goal-ideas" role="group" aria-label={t('Ideas')}>
            {IDEAS.map((idea) => (
              <button type="button" key={idea.key} className={`chip ${name === t(idea.key) ? 'is-on' : ''}`} onClick={() => pickIdea(idea)}>
                {t(idea.key)}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">{t('What should Spendify ask about?')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('checkin-fuel')} maxLength={30} />
          </label>
          <div className="sheet__row">
            <label className="field">
              <span className="field-label">{t('Category')}</span>
              <select value={cat} onChange={(e) => setCat(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {catName(c.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('Usual amount')}</span>
              <div className="input-prefix">
                <span aria-hidden="true">{currencySymbol()}</span>
                <input inputMode="numeric" value={value} onChange={(e) => setValue(formatAmountInput(e.target.value))} placeholder="25.000" />
              </div>
            </label>
          </div>
          <div className="field">
            <span className="field-label">{t('Ask on')}</span>
            <div className="checkin__days" role="group" aria-label={t('Ask on')}>
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" aria-pressed={days.includes(i)} className={`chip ${days.includes(i) ? 'is-on' : ''}`} onClick={() => toggleDay(i)}>
                  {t(w)}
                </button>
              ))}
            </div>
          </div>
          <div className="btn-pair">
            {list.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
                {t('Cancel')}
              </button>
            )}
            <button type="submit" className="btn btn--primary">
              {t('Add daily question')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setAdding(true)}>
          <Plus size={18} /> {t('Add daily question')}
        </button>
      )}
    </div>
  );
}
