import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Check, CircleHelp, Eye, EyeOff, Plus, Settings, Wallet, X } from 'lucide-react';
import { monthSummary, useStore } from '../lib/store';
import { useBackClose } from '../lib/backclose';
import { monthPicture } from '../lib/budget';
import { addMonths, currentMonth, greeting, monthKey, monthLabel, shortDate, toISODate } from '../lib/dates';
import { category } from '../lib/categories';
import { money } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { LangSwitch } from '../components/LangSwitch';
import { GroupedExpenses } from '../components/ExpenseList';
import { useExpenseSheet } from '../components/ExpenseSheet';
import { BackupCard, InstallCard } from '../components/Nudges';
import { Sheet } from '../components/Sheet';
import { RepeatsPanel, TopupPanel, upcomingRepeats } from '../components/MoneyTools';
import { CategoryIcon } from '../components/CategoryIcon';

const STATUS = {
  ok: { label: 'On track', icon: Check },
  fast: { label: 'Spending a bit fast', icon: AlertTriangle },
  over: { label: 'Over budget', icon: AlertTriangle },
};

export default function Home() {
  const { state, expenses, updateSettings } = useStore();
  const open = useExpenseSheet();
  const [panel, setPanel] = useState(null); // 'topup' | 'repeats' | 'help' | null
  const onPanelClosed = useCallback(() => setPanel(null), []);
  const { markOpen, requestClose } = useBackClose(panel !== null, onPanelClosed);
  const openPanel = (name) => {
    markOpen();
    setPanel(name);
  };
  const hidden = !!state.settings.hideAmounts;
  const key = currentMonth();
  const p = useMemo(() => monthPicture(state), [state]);
  const monthName = monthLabel(key, { month: 'long' });

  const totals = {};
  for (const e of expenses) if (monthKey(e.date) === key) totals[e.category] = (totals[e.category] || 0) + e.amount;
  const [topName, topTotal] = Object.entries(totals).sort((x, y) => y[1] - x[1])[0] || [];
  const top = topName ? { name: topName, total: topTotal } : null;

  const recent = expenses.slice(0, 8);

  // Days in a row with at least one expense logged (today doesn't break the streak until it's over).
  const streak = useMemo(() => {
    const days = new Set(expenses.map((e) => e.date));
    const d = new Date();
    if (!days.has(toISODate(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(toISODate(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [expenses]);

  // In the first week of a month, a one-time look back at the month that just ended.
  const prevKey = addMonths(key, -1);
  const [recapSeen, setRecapSeen] = useState(() => {
    try {
      return localStorage.getItem('spendify:recap') === prevKey;
    } catch {
      return false;
    }
  });
  const [dayOfMonth] = useState(() => new Date().getDate());
  let recap = null;
  if (!recapSeen && dayOfMonth <= 7 && state.startMonth <= prevKey) {
    const m = monthSummary(state, prevKey);
    if (m && m.month === prevKey && m.budget > 0 && m.spent > 0) recap = m;
  }
  const dismissRecap = () => {
    try {
      localStorage.setItem('spendify:recap', prevKey);
    } catch {
      /* ignore */
    }
    setRecapSeen(true);
  };
  const curKey = currentMonth();
  const nextRepeat = upcomingRepeats(state.recurring)[0];
  const nextIsMandatory = nextRepeat ? nextRepeat.mandatory !== false : false;
  const skippedCount = state.recurring.filter((r) => (r.skippedMonths || []).includes(curKey)).length;
  const dueRepeats = state.recurring.filter(
    (r) => !(r.skippedMonths || []).includes(curKey) && !expenses.some((e) => e.recurringId === r.id && monthKey(e.date) === curKey)
  );
  const dueTotal = dueRepeats.reduce((s, r) => s + r.amount, 0);

  let repeatHint = t('Rent, subscriptions, bills');
  if (nextRepeat) {
    const nextName = nextRepeat.note || catName(nextRepeat.category);
    const dateStr = shortDate(nextRepeat.next);
    if (dueTotal > 0) {
      repeatHint = t('Next: {name}, {date} • {amount} due this month', {
        name: nextName,
        date: dateStr,
        amount: money(dueTotal),
      });
    } else {
      repeatHint = t('Next: {name}, {date}', { name: nextName, date: dateStr });
    }
  } else if (state.recurring.length > 0) {
    repeatHint = t('All {count} repeats settled for this month', { count: state.recurring.length });
  }

  const st = STATUS[p.status];
  const statusLine =
    p.status === 'none'
      ? t('Set your income in Settings to see what’s left.')
      : p.status === 'over'
        ? t('status-over', { amount: money(p.fromSavings) })
        : t(`status-${p.status}`);

  const todayOver = p.todayLeft < 0;

  return (
    <div className={`page home ${hidden ? 'is-private' : ''}`}>
      <header className="home__head">
        <div>
          <p className="home__hello">{greeting()},</p>
          <h1 className="home__name">{state.profile?.name}</h1>
        </div>
        <div className="home__tools">
          <LangSwitch />
          <button
            className="icon-btn"
            onClick={() => updateSettings({ hideAmounts: !hidden })}
            aria-pressed={hidden}
            aria-label={hidden ? t('Show amounts') : t('Hide amounts')}
          >
            {hidden ? <EyeOff size={21} /> : <Eye size={21} />}
          </button>
          <Link to="/settings" className="icon-btn home__settings" aria-label={t('Settings')}>
            <Settings size={22} />
          </Link>
        </div>
      </header>

      {streak >= 3 && (
        <p className="streak">
          <span aria-hidden="true">🔥</span> {t('streak', { n: streak })}
        </p>
      )}

      {recap && (
        <section className="nudge nudge--recap" aria-labelledby="recap-title">
          <button className="icon-btn icon-btn--sm nudge__close" onClick={dismissRecap} aria-label={t('Got it')}>
            <X size={16} />
          </button>
          <h2 id="recap-title" className="nudge__title">
            {t('{month} recap', { month: monthLabel(prevKey, { month: 'long' }) })}
          </h2>
          <p className="nudge__body">
            {recap.spent > recap.budget
              ? t('recap-over', { spent: money(recap.spent), over: money(recap.spent - recap.budget), budget: money(recap.budget) })
              : recap.leftBudget > 0
                ? t('recap-saved', { spent: money(recap.spent), budget: money(recap.budget), left: money(recap.leftBudget) })
                : t('recap-exact', { spent: money(recap.spent) })}
          </p>
        </section>
      )}

      {/* 1. How much can I still spend this month? */}
      <section className={`month-card is-${p.status}`} aria-labelledby="month-label">
        <div className="month-card__top">
          <p id="month-label" className="month-card__label">
            {t('Money left this month')}
          </p>
          <button className="icon-btn icon-btn--sm" onClick={() => openPanel('help')} aria-label={t('How this works')}>
            <CircleHelp size={18} />
          </button>
        </div>
        <p className="month-card__num">{money(p.left)}</p>

        {st && (
          <p className="status-pill">
            <st.icon size={15} strokeWidth={2.75} aria-hidden="true" /> {t(st.label)}
          </p>
        )}

        <div
          className="meter"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.usedFrac * 100)}
          aria-label={t('Budget used')}
        >
          <div className="meter__fill" style={{ '--w': `${p.usedFrac * 100}%` }} />
        </div>
        <div className="month-card__scale">
          <span>{t('Spent {spent} of {budget}', { spent: money(p.spent), budget: money(p.budget) })}</span>
          <span>{tn(p.daysLeft, '{n} day left in {month}', '{n} days left in {month}', { month: monthName })}</span>
        </div>

        <p className="month-card__status">{statusLine}</p>
      </section>

      {/* 2. How much can I spend today? */}
      {p.status !== 'none' && (
        <section className={`today-card ${todayOver ? 'is-over' : ''}`} aria-labelledby="today-label">
          <div>
            <p id="today-label" className="today-card__label">
              {todayOver ? t('Over today’s share') : t('You can spend today')}
            </p>
            <p className="today-card__num">{money(Math.abs(p.todayLeft))}</p>
            <p className="today-card__hint">
              {p.status === 'over'
                ? t('Budget used up today')
                : todayOver
                  ? t('Tomorrow’s share will be a little smaller.', { allowance: money(p.allowance) })
                  : t('Today’s share {allowance}, spent {spent}', { allowance: money(p.allowance), spent: money(p.todaySpent) })}
            </p>
          </div>
          <button className="btn btn--primary today-card__add" onClick={() => open()}>
            <Plus size={18} strokeWidth={2.75} /> {t('Add expense')}
          </button>
        </section>
      )}

      {/* 3. Savings + where it goes */}
      <div className="tiles tiles--2">
        <div className="tile tile--save">
          <p className="tile__label">{t('Savings')}</p>
          <p className="tile__value">{money(p.leftSavings)}</p>
          <p className="tile__hint">{p.carriedIn > 0 ? t('savings-hint-carry', { amount: money(p.carriedIn) }) : t('savings-hint')}</p>
        </div>
        <div className="tile">
          <p className="tile__label">{t('Most spent on')}</p>
          <p className="tile__value tile__value--text">
            {top ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CategoryIcon name={top.name} size={20} color={category(top.name).color} />
                <span>{catName(top.name)}</span>
              </span>
            ) : (
              '—'
            )}
          </p>
          <p className="tile__hint">{top ? money(top.total) : t('no spending yet')}</p>
        </div>
      </div>

      <div className="actions">
        <button className="action" onClick={() => openPanel('topup')}>
          <span className="action__icon action__icon--money" aria-hidden="true">
            <Wallet size={20} />
          </span>
          <span className="action__text">
            <span className="action__title">{t('Add money')}</span>
            <span className="action__hint">{t('Bonus, gift or refund')}</span>
          </span>
        </button>
        <button className="action" onClick={() => openPanel('repeats')}>
          <span className="action__icon" aria-hidden="true">
            <CalendarClock size={20} />
          </span>
          <span className="action__text">
            <span className="action__title">
              <span>{t('Monthly repeats')}</span>
              {state.recurring.length > 0 && <span className="badge">{state.recurring.length}</span>}
              {nextRepeat && (
                <span className={`badge badge--sm ${nextIsMandatory ? 'badge--mandatory' : 'badge--flexible'}`}>
                  {nextIsMandatory ? t('Mandatory') : t('Flexible')}
                </span>
              )}
              {skippedCount > 0 && (
                <span className="badge badge--sm badge--warn">
                  {t('{n} skipped', { n: skippedCount })}
                </span>
              )}
            </span>
            <span className="action__hint">{repeatHint}</span>
          </span>
        </button>
      </div>

      {panel === 'topup' && (
        <Sheet title={t('Add money')} onClose={requestClose}>
          <TopupPanel onDone={requestClose} />
        </Sheet>
      )}
      {panel === 'repeats' && (
        <Sheet title={t('Monthly repeats')} onClose={requestClose}>
          <RepeatsPanel />
        </Sheet>
      )}
      {panel === 'help' && (
        <Sheet title={t('How this works')} onClose={requestClose}>
          <div className="explain">
            <p>{t('how-1')}</p>
            <p>{t('how-2')}</p>
            <p>{t('how-3')}</p>
          </div>
        </Sheet>
      )}

      <BackupCard />
      <InstallCard />

      <section className="section">
        <div className="section__head">
          <h2>{t('Recent')}</h2>
          {expenses.length > recent.length && (
            <Link to="/history" className="link-btn">
              {t('See all')}
            </Link>
          )}
        </div>
        {recent.length ? (
          <GroupedExpenses expenses={recent} />
        ) : (
          <div className="empty">
            <p className="empty__title">{t('Nothing logged yet')}</p>
            <p>{t('Add what you spend as you go. It takes about five seconds.')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
