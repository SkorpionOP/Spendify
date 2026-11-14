import { useMemo, useState } from 'react';
import { Check, Plus, RefreshCw } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentMonth, cycleDate, cycleStart, dateInCycle, dayLabel, daysInMonth, monthKey, monthLabel, parseISO, today } from '../lib/dates';
import { calCompact, money } from '../lib/format';
import { catName, getConfig, t, tn } from '../lib/i18n';
import { category } from '../lib/categories';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { ExpenseRow } from '../components/ExpenseList';
import { useExpenseSheet } from '../components/ExpenseSheet';
import { CategoryIcon } from '../components/CategoryIcon';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const { state, expenses } = useStore();
  const open = useExpenseSheet();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState(today());

  const byDay = useMemo(() => {
    const m = {};
    for (const e of expenses) if (monthKey(e.date) === month) (m[e.date] ||= []).push(e);
    return m;
  }, [expenses, month]);

  const totals = Object.fromEntries(Object.entries(byDay).map(([d, list]) => [d, list.reduce((s, e) => s + e.amount, 0)]));
  const max = Math.max(1, ...Object.values(totals));
  const monthTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  // The grid runs from payday to the day before the next one (a plain calendar month when payday is the 1st).
  const firstWeekday = (parseISO(cycleStart(month)).getDay() + 6) % 7; // Monday = 0
  const n = daysInMonth(month);
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: n }, (_, i) => cycleDate(month, i + 1))];
  const firstCell = cells[firstWeekday];
  // Show the month name on the first day and wherever a new calendar month starts.
  const numLabel = (d) =>
    d === firstCell || d.endsWith('-01') ? parseISO(d).toLocaleDateString(getConfig().locale, { day: 'numeric', month: 'short' }) : Number(d.slice(8));

  const repeatsByDay = useMemo(() => {
    const map = {};
    for (const r of state.recurring || []) {
      if ((r.skippedMonths || []).includes(month)) continue;
      if (r.since && r.since > month) continue;
      const dateStr = dateInCycle(month, r.day);
      const isLogged = expenses.some((e) => e.recurringId === r.id && monthKey(e.date) === month);
      (map[dateStr] ||= []).push({ ...r, isLogged });
    }
    return map;
  }, [state.recurring, expenses, month]);

  const monthPendingRepeatsCount = useMemo(() => {
    let count = 0;
    for (const list of Object.values(repeatsByDay)) {
      count += list.filter((r) => !r.isLogged).length;
    }
    return count;
  }, [repeatsByDay]);

  const changeMonth = (m) => {
    setMonth(m);
    setSelected(m === currentMonth() ? today() : cycleStart(m));
  };

  const dayList = byDay[selected] || [];
  const selectedRepeats = repeatsByDay[selected] || [];
  const todayIso = today();
  const activeDays = Object.keys(totals).length;

  return (
    <div className="page">
      <header className="page__head">
        <h1>{t('Calendar')}</h1>
        <div className="cal__head-actions">
          {(month !== currentMonth() || selected !== todayIso) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm cal__today-btn"
              onClick={() => {
                setMonth(currentMonth());
                setSelected(today());
              }}
            >
              {t('Today')}
            </button>
          )}
          <MonthSwitcher value={month} onChange={changeMonth} />
        </div>
      </header>

      <div className="card cal">
        <div className="cal__grid" role="grid" aria-label={t('Spending by day')}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal__wd" role="columnheader">
              {t(w)}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} aria-hidden="true" />;
            const hasSpending = !!totals[d];
            const dayRepeats = repeatsByDay[d] || [];
            const hasPendingRepeats = dayRepeats.some((r) => !r.isLogged);
            const isToday = d === todayIso;
            const isFuture = d > todayIso;
            const isSelected = d === selected;

            return (
              <button
                key={d}
                type="button"
                className={`cal__day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${isFuture ? 'is-future' : ''} ${hasSpending ? 'has-spend' : ''}`}
                style={{ '--heat': totals[d] ? Math.max(0.18, Math.min(1, totals[d] / max)) : 0 }}
                onClick={() => setSelected(d)}
                aria-pressed={isSelected}
                aria-label={`${dayLabel(d)}, ${totals[d] ? money(totals[d]) : t('nothing spent')}${dayRepeats.length ? `, ${dayRepeats.length} ${t('repeats')}` : ''}`}
              >
                <span className={`cal__num ${typeof numLabel(d) === 'string' ? 'cal__num--month' : ''}`}>{numLabel(d)}</span>
                {totals[d] ? (
                  <span className="cal__amt">{calCompact(totals[d])}</span>
                ) : hasPendingRepeats ? (
                  <span className="cal__repeat-tag" title={t('Scheduled repeat')}>
                    <RefreshCw size={9} aria-hidden="true" />
                  </span>
                ) : null}
                {hasPendingRepeats && totals[d] && <span className="cal__repeat-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div className="cal__foot">
          <div className="cal__summary">
            <span>
              {activeDays > 0
                ? tn(activeDays, '{amount} spent across {n} day', '{amount} spent across {n} days', {
                    amount: money(monthTotal),
                  })
                : t('No spending in {month}', { month: monthLabel(month, { month: 'long' }) })}
            </span>
            {monthPendingRepeatsCount > 0 && (
              <span className="cal__pending-badge">
                • {t('{n} repeats upcoming', { n: monthPendingRepeatsCount })}
              </span>
            )}
          </div>
          <div className="cal__legend" aria-hidden="true">
            <span>{t('Low')}</span>
            <span className="cal__legend-bar" />
            <span>{t('High')}</span>
          </div>
        </div>
      </div>

      <section className="section cal__day-section">
        <div className="section__head">
          <h2>{dayLabel(selected)}</h2>
          <span className="section__aside">{money(totals[selected] || 0)}</span>
        </div>

        {selectedRepeats.length > 0 && (
          <div className="card cal__repeats-card">
            <div className="cal__repeats-head">
              <span className="cal__repeats-title">
                <RefreshCw size={14} />
                {t('Scheduled repeats for this day')}
              </span>
            </div>
            <ul className="cal__repeats-list">
              {selectedRepeats.map((r) => (
                <li key={r.id} className="cal__repeat-item">
                  <span className="cal__repeat-emoji" aria-hidden="true">
                    <CategoryIcon name={r.category} size={20} color={category(r.category).color} />
                  </span>
                  <div className="cal__repeat-info">
                    <span className="cal__repeat-name">{r.note || catName(r.category)}</span>
                    <span className="cal__repeat-sub">
                      {money(r.amount)} • {r.mandatory !== false ? t('Mandatory') : t('Flexible')}
                    </span>
                  </div>
                  {r.isLogged ? (
                    <span className="badge badge--success">
                      <Check size={12} /> {t('Logged')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--xs"
                      onClick={() => open({ amount: r.amount, category: r.category, note: r.note, date: selected, recurringId: r.id })}
                    >
                      {t('Log now')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dayList.length ? (
          <ul className="tx-list card card--flush">
            {dayList.map((e) => (
              <ExpenseRow key={e.id} expense={e} />
            ))}
          </ul>
        ) : (
          <div className="empty empty--small">
            <p>{selected > todayIso ? t('No expenses logged yet for this date.') : t('No spending on this day.')}</p>
          </div>
        )}

        <button className="btn btn--ghost btn--block" onClick={() => open({ date: selected })}>
          <Plus size={18} /> {t('Add an expense on this day')}
        </button>
      </section>
    </div>
  );
}
