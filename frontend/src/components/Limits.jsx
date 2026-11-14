import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { limitStatus } from '../lib/money';
import { useStore } from '../lib/store';
import { addMonths, currentMonth, monthKey } from '../lib/dates';
import { CATEGORIES, category as catMeta } from '../lib/categories';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { catName, t } from '../lib/i18n';
import { CategoryIcon } from './CategoryIcon';
import { useToast } from './Toasts';

const LEVEL_TEXT = {
  ok: (l) => t('{amount} left', { amount: money(l.left) }),
  near: (l) => (l.left > 0 ? t('Only {amount} left', { amount: money(l.left) }) : t('Limit reached')),
  over: (l) => t('{amount} over', { amount: money(-l.left) }),
};

/** This month's limits on Home, worst first. */
export function LimitsSection({ onManage, onlyWarnings = false }) {
  const { state } = useStore();
  const rows = limitStatus(state, currentMonth()).filter((l) => !onlyWarnings || l.level !== 'ok');
  if (!rows.length) return null;
  return (
    <section className="section limits" aria-labelledby="limits-title">
      <div className="section__head">
        <h2 id="limits-title">{onlyWarnings ? t('Watch out') : t('Category limits')}</h2>
        <button className="link-btn" onClick={onManage}>
          {t('Change')}
        </button>
      </div>
      <ul className="limit-list">
        {rows.map((l) => (
          <li key={l.category} className={`limit is-${l.level}`}>
            <CategoryIcon name={l.category} size={18} color={catMeta(l.category).color} />
            <span className="limit__body">
              <span className="limit__top">
                <span className="limit__name">{catName(l.category)}</span>
                <span className="limit__left private-num">{LEVEL_TEXT[l.level](l)}</span>
              </span>
              <span className="limit__bar" aria-hidden="true">
                <span style={{ '--w': `${Math.min(1, l.frac) * 100}%` }} />
              </span>
              <span className="limit__meta private-num">
                {t('{spent} of {limit} this month', { spent: money(l.spent), limit: money(l.limit) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Round up to a friendly number: 173.500 → 180.000 */
const friendly = (n) => {
  if (n <= 0) return 0;
  const step = n >= 1_000_000 ? 100_000 : n >= 100_000 ? 10_000 : 5_000;
  return Math.ceil(n / step) * step;
};

/** Add, change or remove monthly limits. */
export function LimitsPanel() {
  const { state, expenses, setLimit } = useStore();
  const toast = useToast();
  const [cat, setCat] = useState('');
  const [amount, setAmount] = useState('');
  const limits = state.limits;
  const status = Object.fromEntries(limitStatus(state, currentMonth()).map((l) => [l.category, l]));

  // Last month's spending per category, used to suggest a starting limit.
  const lastMonth = useMemo(() => {
    const key = addMonths(currentMonth(), -1);
    const out = {};
    for (const e of expenses) if (monthKey(e.date) === key) out[e.category] = (out[e.category] || 0) + e.amount;
    return out;
  }, [expenses]);

  // Categories she spends on most come first in the picker.
  const options = useMemo(() => {
    const counts = {};
    for (const e of expenses.slice(0, 300)) counts[e.category] = (counts[e.category] || 0) + 1;
    return CATEGORIES.filter((c) => !limits[c.name]).sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));
  }, [expenses, limits]);

  const pick = (name) => {
    setCat(name);
    const s = friendly(lastMonth[name] || 0);
    setAmount(s ? amountToInput(s) : '');
  };

  const add = (e) => {
    e.preventDefault();
    const v = parseAmountInput(amount);
    if (!cat) return toast(t('Pick a category first.'), { tone: 'warn' });
    if (!(v > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    setLimit(cat, v);
    toast(t('Limit set: {category} {amount} a month', { category: catName(cat), amount: money(v) }));
    setCat('');
    setAmount('');
  };

  return (
    <div className="panel">
      <p className="muted">{t('limits-intro')}</p>

      {Object.keys(limits).length > 0 && (
        <ul className="limit-edit">
          {Object.entries(limits).map(([name, value]) => (
            <LimitRow key={name} name={name} value={value} spent={status[name]?.spent || 0} onSave={(v) => setLimit(name, v)} />
          ))}
        </ul>
      )}

      <form className="limit-add" onSubmit={add}>
        <span className="field-label">{t('New limit')}</span>
        <div className="limit-pick" role="radiogroup" aria-label={t('Category')}>
          {options.slice(0, 8).map((c) => (
            <button
              type="button"
              key={c.name}
              role="radio"
              aria-checked={cat === c.name}
              className={`chip ${cat === c.name ? 'is-on' : ''}`}
              onClick={() => pick(c.name)}
            >
              <CategoryIcon name={c.name} size={15} color={cat === c.name ? 'currentColor' : c.color} /> {catName(c.name)}
            </button>
          ))}
          {options.length > 8 && (
            <select
              className="chip limit-pick__more"
              value={options.slice(0, 8).some((c) => c.name === cat) ? '' : cat}
              onChange={(e) => e.target.value && pick(e.target.value)}
              aria-label={t('More')}
            >
              <option value="">{t('More')}…</option>
              {options.slice(8).map((c) => (
                <option key={c.name} value={c.name}>
                  {catName(c.name)}
                </option>
              ))}
            </select>
          )}
        </div>
        {cat && (
          <>
            <div className="input-prefix">
              <span aria-hidden="true">{currencySymbol()}</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                placeholder="200.000"
                aria-label={t('Limit per month')}
                autoFocus
              />
            </div>
            {lastMonth[cat] > 0 && (
              <p className="muted small">{t('Last month you spent {amount} on this.', { amount: money(lastMonth[cat]) })}</p>
            )}
            <button className="btn btn--primary btn--block" type="submit">
              <Plus size={18} /> {t('Set limit for {category}', { category: catName(cat) })}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

function LimitRow({ name, value, spent, onSave }) {
  const [draft, setDraft] = useState(() => amountToInput(value));
  const toast = useToast();
  const commit = () => {
    const v = parseAmountInput(draft);
    if (v > 0 && v !== value) {
      onSave(v);
      toast(t('Limit set: {category} {amount} a month', { category: catName(name), amount: money(v) }));
    } else setDraft(amountToInput(value));
  };
  return (
    <li>
      <CategoryIcon name={name} size={18} color={catMeta(name).color} />
      <span className="limit-edit__name">
        {catName(name)}
        <span className="muted small private-num">{t('{amount} used this month', { amount: money(spent) })}</span>
      </span>
      <span className="input-prefix input-prefix--sm">
        <span aria-hidden="true">{currencySymbol()}</span>
        <input
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(formatAmountInput(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          aria-label={t('Limit for {category}', { category: catName(name) })}
        />
      </span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label={t('Remove limit for {category}', { category: catName(name) })}
        onClick={() => {
          onSave(0);
          toast(t('Limit removed'));
        }}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
