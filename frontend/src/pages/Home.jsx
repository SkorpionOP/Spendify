import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Check, CircleHelp, Eye, EyeOff, Gauge, HandCoins, Settings, Sparkles, Target, Wallet, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { dueCheckins, limitStatus } from '../lib/money';
import { monthRecap, weekRecap } from '../lib/recap';
import { useBackClose } from '../lib/backclose';
import { monthPicture } from '../lib/budget';
import { addDaysISO, addMonths, currentMonth, cycleEnd, cycleStart, greeting, isPayCycle, monthKey, monthLabel, shortDate, toISODate } from '../lib/dates';
import { AiRecap } from '../components/AiRecap';
import { IouCard } from '../components/IouCard';
import { debtSummary } from '../lib/iou';
import { money } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { GroupedExpenses } from '../components/ExpenseList';
import { BackupCard, InstallCard, PaydayCard } from '../components/Nudges';
import { Sheet } from '../components/Sheet';
import { RepeatsPanel, TopupPanel } from '../components/MoneyTools';
import { CheckinCard, CheckinsPanel } from '../components/Checkins';
import { CheerCard } from '../components/CheerCard';
import { GoalEditor, SavingsCard } from '../components/Goals';
import { LimitsPanel, LimitsSection } from '../components/Limits';

const readSeen = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeSeen = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the card just shows again next time */
  }
};

const STATUS = {
  ok: { label: 'On track', icon: Check },
  fast: { label: 'Spending a bit fast', icon: AlertTriangle },
  over: { label: 'Over budget', icon: AlertTriangle },
};

export default function Home() {
  const { state, expenses, updateSettings } = useStore();
  const [panel, setPanel] = useState(null); // 'topup' | 'repeats' | 'help' | 'goal' | 'limits' | null
  const [goal, setGoal] = useState(null);
  const onPanelClosed = useCallback(() => setPanel(null), []);
  const { markOpen, requestClose } = useBackClose(panel !== null, onPanelClosed);
  const openPanel = (name) => {
    markOpen();
    setPanel(name);
  };
  const editGoal = (g) => {
    setGoal(g);
    openPanel('goal');
  };
  const hidden = !!state.settings.hideAmounts;
  const key = currentMonth();
  const p = useMemo(() => monthPicture(state), [state]);
  const monthName = monthLabel(key, { month: 'long' });


  const recent = expenses.slice(0, 5);

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

  // Look-backs: the month that just ended (first 7 days), otherwise last week (Monday to Wednesday). Each shows once.
  const [now] = useState(() => new Date());
  const [seen, setSeen] = useState(() => ({ month: readSeen('spendify:recap'), week: readSeen('spendify:wrecap') }));
  const mRecap = monthRecap(state, now);
  const recap = mRecap && seen.month !== mRecap.key ? mRecap : null;
  const wRecap = recap ? null : weekRecap(state, now);
  const week = wRecap && seen.week !== wRecap.key && state.startMonth <= monthKey(wRecap.to) ? wRecap : null;
  const dismissRecap = () => {
    writeSeen('spendify:recap', mRecap.key);
    setSeen((x) => ({ ...x, month: mRecap.key }));
  };
  // The periods the AI recap compares: the one that ended and the one before it
  const recapKey = recap?.key;
  const monthPeriod = useMemo(
    () =>
      recapKey
        ? { month: recapKey, from: cycleStart(recapKey), to: cycleEnd(recapKey), prevFrom: cycleStart(addMonths(recapKey, -1)), prevTo: cycleEnd(addMonths(recapKey, -1)) }
        : null,
    [recapKey]
  );
  const weekFrom = week?.from;
  const weekTo = week?.to;
  const weekPeriod = useMemo(
    () => (weekFrom ? { from: weekFrom, to: weekTo, prevFrom: addDaysISO(weekFrom, -7), prevTo: addDaysISO(weekFrom, -1) } : null),
    [weekFrom, weekTo]
  );
  const dismissWeek = () => {
    writeSeen('spendify:wrecap', week.key);
    setSeen((x) => ({ ...x, week: week.key }));
  };
  const iouOverdue = debtSummary(state.debts, toISODate(now)).overdue;
  const checkins = dueCheckins(state);
  const limits = limitStatus(state, key);
  const limitWarn = limits.filter((l) => l.level !== 'ok').length;

  // Repeats still to come this month: shown as the badge on the shortcut, details are in the panel.
  const dueRepeats = state.recurring.filter(
    (r) => !(r.skippedMonths || []).includes(key) && !expenses.some((e) => e.recurringId === r.id && monthKey(e.date) === key)
  ).length;

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
          <button
            className="icon-btn"
            onClick={() => updateSettings({ hideAmounts: !hidden })}
            aria-pressed={hidden}
            aria-label={hidden ? t('Show amounts') : t('Hide amounts')}
          >
            {hidden ? <EyeOff size={21} /> : <Eye size={21} />}
          </button>
          {/* On phones the tab bar is full, so Ask Spendify lives here; on PC it's in the sidebar. */}
          <Link to="/twin" className="icon-btn home__ask" aria-label={t('Ask Spendify')} title={t('Ask Spendify')}>
            <Sparkles size={20} />
          </Link>
          <Link to="/settings" className="icon-btn home__settings" aria-label={t('Settings')}>
            <Settings size={22} />
          </Link>
        </div>
      </header>

      {/* "Filled up your bike today?": asked once a day on the days she picked */}
      {checkins.map((c) => (
        <CheckinCard key={c.id} checkin={c} />
      ))}

      {/* One small celebration at a time, and not on top of a recap */}
      {!recap && !week && <CheerCard />}

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
            {t('{month} recap', { month: monthLabel(recap.key, { month: 'long' }) })}
          </h2>
          <p className="nudge__body">
            {recap.spent > recap.budget
              ? t('recap-over', { spent: money(recap.spent), over: money(recap.spent - recap.budget), budget: money(recap.budget) })
              : recap.leftBudget > 0
                ? t('recap-saved', { spent: money(recap.spent), budget: money(recap.budget), left: money(recap.leftBudget) })
                : t('recap-exact', { spent: money(recap.spent) })}
          </p>
          <AiRecap kind="month" period={monthPeriod} />
        </section>
      )}

      {week && (
        <section className="nudge nudge--recap" aria-labelledby="week-title">
          <button className="icon-btn icon-btn--sm nudge__close" onClick={dismissWeek} aria-label={t('Got it')}>
            <X size={16} />
          </button>
          <h2 id="week-title" className="nudge__title">
            {t('Last week, {from} to {to}', { from: shortDate(week.from), to: shortDate(week.to) })}
          </h2>
          <p className="nudge__body">
            {t('week-spent', { amount: money(week.spent), n: week.count })}{' '}
            {week.change == null
              ? ''
              : week.change <= -0.05
                ? t('week-less', { pct: Math.round(-week.change * 100) })
                : week.change >= 0.05
                  ? t('week-more', { pct: Math.round(week.change * 100) })
                  : t('week-same')}{' '}
            {t('week-top', { category: catName(week.topCat), amount: money(week.topAmount) })}
            {week.noSpendDays > 0 ? ` ${tn(week.noSpendDays, 'week-nospend-1', 'week-nospend', {})}` : ''}
          </p>
          <AiRecap kind="week" period={weekPeriod} />
        </section>
      )}

      <PaydayCard />

      {/* One calm card: what's left this month, and what's left for today */}
      <section className={`hero is-${p.status}`} aria-labelledby="hero-label">
        <div className="hero__top">
          <p id="hero-label" className="hero__label">
            {t('Money left this month')}
          </p>
          {st && p.status !== 'over' ? (
            <button className="hero__status" onClick={() => openPanel('help')}>
              <st.icon size={14} strokeWidth={2.75} aria-hidden="true" /> {t(st.label)}
              <CircleHelp size={14} aria-hidden="true" className="hero__help" />
            </button>
          ) : (
            <button className="icon-btn icon-btn--sm" onClick={() => openPanel('help')} aria-label={t('How this works')}>
              <CircleHelp size={18} />
            </button>
          )}
        </div>
        <p className="hero__num">{money(p.left)}</p>

        {p.status !== 'none' ? (
          <>
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
            <p className="hero__scale">
              {t('Spent {spent} of {budget}', { spent: money(p.spent), budget: money(p.budget) })}.{' '}
              {isPayCycle()
                ? tn(p.daysLeft, '{n} day until payday', '{n} days until payday')
                : tn(p.daysLeft, '{n} day left in {month}', '{n} days left in {month}', { month: monthName })}
              .
            </p>
            {p.status !== 'ok' && <p className="hero__note">{statusLine}</p>}

            {/* Once the month's budget is gone, "today's share" means nothing, so it's left out. */}
            {p.status !== 'over' && (
              <div className={`hero__today ${todayOver ? 'is-over' : ''}`}>
                <p className="hero__today-label">{todayOver ? t('Over today’s share') : t('You can spend today')}</p>
                <p className="hero__today-num">{money(Math.abs(p.todayLeft))}</p>
              </div>
            )}
          </>
        ) : (
          <p className="hero__note">{statusLine}</p>
        )}
      </section>

      {/* Shortcuts, e-wallet style */}
      <nav className="shortcuts" aria-label={t('Shortcuts')}>
        <button className="shortcut" onClick={() => openPanel('topup')}>
          <span className="shortcut__icon shortcut__icon--money" aria-hidden="true">
            <Wallet size={22} />
          </span>
          <span className="shortcut__label">{t('Add money')}</span>
        </button>
        <button className="shortcut" onClick={() => openPanel('repeats')}>
          <span className="shortcut__icon" aria-hidden="true">
            <CalendarClock size={22} />
            {dueRepeats > 0 && <span className="shortcut__badge">{dueRepeats}</span>}
          </span>
          <span className="shortcut__label">{t('Regulars')}</span>
        </button>
        <button className="shortcut" onClick={() => editGoal({})}>
          <span className="shortcut__icon shortcut__icon--goal" aria-hidden="true">
            <Target size={22} />
          </span>
          <span className="shortcut__label">{t('Goal')}</span>
        </button>
        <button className="shortcut" onClick={() => openPanel('limits')}>
          <span className={`shortcut__icon ${limitWarn ? 'shortcut__icon--warn' : ''}`} aria-hidden="true">
            <Gauge size={22} />
            {limitWarn > 0 && <span className="shortcut__badge shortcut__badge--warn">{limitWarn}</span>}
          </span>
          <span className="shortcut__label">{t('Limits')}</span>
        </button>
        <Link className="shortcut" to="/iou">
          <span className={`shortcut__icon ${iouOverdue ? 'shortcut__icon--warn' : ''}`} aria-hidden="true">
            <HandCoins size={22} />
            {iouOverdue > 0 && <span className="shortcut__badge shortcut__badge--warn">{iouOverdue}</span>}
          </span>
          <span className="shortcut__label">{t('IOUs')}</span>
        </Link>
      </nav>

      <SavingsCard savings={p.leftSavings} carriedIn={p.carriedIn} onEdit={editGoal} />

      <IouCard />

      <LimitsSection onManage={() => openPanel('limits')} onlyWarnings />

      {panel === 'topup' && (
        <Sheet title={t('Add money')} onClose={requestClose}>
          <TopupPanel onDone={requestClose} />
        </Sheet>
      )}
      {panel === 'repeats' && (
        <Sheet title={t('Regulars')} onClose={requestClose}>
          <h3 className="sheet__sub">{t('Ask me every day')}</h3>
          <CheckinsPanel />
          <h3 className="sheet__sub">{t('Monthly repeats')}</h3>
          <RepeatsPanel />
        </Sheet>
      )}
      {panel === 'goal' && goal && (
        <Sheet title={goal.id ? goal.name : t('New savings goal')} onClose={requestClose}>
          <GoalEditor goal={goal} onDone={requestClose} />
        </Sheet>
      )}
      {panel === 'limits' && (
        <Sheet title={t('Category limits')} onClose={requestClose}>
          <LimitsPanel />
        </Sheet>
      )}
      {panel === 'help' && (
        <Sheet title={t('How this works')} onClose={requestClose}>
          <div className="explain">
            {p.status !== 'none' && <p className="explain__status">{statusLine}</p>}
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
