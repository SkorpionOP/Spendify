import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { currentMonth, dayLabel, daysInMonth, monthKey, parseISO, today } from '../lib/dates';
import { compact, money } from '../lib/format';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { ExpenseRow } from '../components/ExpenseList';
import { useExpenseSheet } from '../components/ExpenseSheet';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const { expenses } = useStore();
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

  const firstWeekday = (parseISO(`${month}-01`).getDay() + 6) % 7; // Monday = 0
  const n = daysInMonth(month);
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const changeMonth = (m) => {
    setMonth(m);
    setSelected(m === currentMonth() ? today() : `${m}-01`);
  };

  const dayList = byDay[selected] || [];
  const t = today();

  return (
    <div className="page">
      <header className="page__head">
        <h1>Calendar</h1>
        <MonthSwitcher value={month} onChange={changeMonth} />
      </header>

      <div className="card cal">
        <div className="cal__grid" role="grid" aria-label="Spending by day">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal__wd" role="columnheader">
              {w.slice(0, 1)}
              <span className="sr-only">{w.slice(1)}</span>
            </div>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button
                key={d}
                className={`cal__day ${d === selected ? 'is-selected' : ''} ${d === t ? 'is-today' : ''}`}
                style={{ '--heat': totals[d] ? 0.15 + 0.85 * (totals[d] / max) : 0 }}
                onClick={() => setSelected(d)}
                disabled={d > t}
                aria-pressed={d === selected}
                aria-label={`${dayLabel(d)}${totals[d] ? `, ${money(totals[d])}` : ', nothing spent'}`}
              >
                <span className="cal__num">{Number(d.slice(8))}</span>
                {totals[d] ? <span className="cal__amt">{compact(totals[d])}</span> : null}
              </button>
            ) : (
              <div key={`b${i}`} aria-hidden="true" />
            )
          )}
        </div>
        <p className="cal__foot">
          {money(monthTotal)} spent across {Object.keys(totals).length} days. Darker days cost more.
        </p>
      </div>

      <section className="section">
        <div className="section__head">
          <h2>{dayLabel(selected)}</h2>
          <span className="section__aside">{money(totals[selected] || 0)}</span>
        </div>
        {dayList.length ? (
          <ul className="tx-list card card--flush">
            {dayList.map((e) => (
              <ExpenseRow key={e.id} expense={e} />
            ))}
          </ul>
        ) : (
          <div className="empty empty--small">
            <p>No spending on this day.</p>
          </div>
        )}
        <button className="btn btn--ghost btn--block" onClick={() => open({ date: selected })}>
          <Plus size={18} /> Add an expense on this day
        </button>
      </section>
    </div>
  );
}
