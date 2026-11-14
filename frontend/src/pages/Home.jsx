import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings } from 'lucide-react';
import { monthSummary, useStore } from '../lib/store';
import { currentMonth, daysInMonth, greeting, monthKey, monthLabel, today } from '../lib/dates';
import { category } from '../lib/categories';
import { money } from '../lib/format';
import { GroupedExpenses } from '../components/ExpenseList';
import { useExpenseSheet } from '../components/ExpenseSheet';

export default function Home() {
  const { state, expenses } = useStore();
  const open = useExpenseSheet();
  const key = currentMonth();
  const s = useMemo(() => monthSummary(state, key), [state, key]);

  const dayOfMonth = new Date().getDate();
  const totalDays = daysInMonth(key);
  const daysLeft = totalDays - dayOfMonth + 1;
  const pace = dayOfMonth / totalDays; // share of month elapsed (incl. today)
  const expectedByNow = s.budget * pace;
  const paceDiff = expectedByNow - s.spent; // positive = under pace

  const leftFrac = s.budget > 0 ? Math.max(0, s.leftBudget) / s.budget : 0;
  const perDay = Math.max(0, s.leftBudget) / daysLeft;

  const monthExpenses = useMemo(() => expenses.filter((e) => monthKey(e.date) === key), [expenses, key]);
  const todayCount = monthExpenses.filter((e) => e.date === today()).length;
  const todaySpent = monthExpenses.filter((e) => e.date === today()).reduce((a, e) => a + e.amount, 0);
  const top = useMemo(() => {
    const t = {};
    for (const e of monthExpenses) t[e.category] = (t[e.category] || 0) + e.amount;
    const [name, total] = Object.entries(t).sort((a, b) => b[1] - a[1])[0] || [];
    return name ? { name, total } : null;
  }, [monthExpenses]);

  const recent = expenses.slice(0, 8);
  const overBudget = s.spent > s.budget;

  let status;
  if (s.budget <= 0) status = 'Set your income in Settings to see what’s left.';
  else if (overBudget) status = `${money(s.fromSavings)} has come out of savings this month.`;
  else if (paceDiff >= 0) status = `${money(paceDiff)} under where you’d expect by today.`;
  else status = `${money(-paceDiff)} ahead of pace. Slow down a little to make it to the 1st.`;

  return (
    <div className="page home">
      <header className="home__head">
        <div>
          <p className="home__hello">{greeting()},</p>
          <h1 className="home__name">{state.profile?.name}</h1>
        </div>
        <Link to="/settings" className="icon-btn home__settings" aria-label="Settings">
          <Settings size={22} />
        </Link>
      </header>

      <section className={`jar-card ${overBudget ? 'is-over' : ''}`} aria-labelledby="left-label">
        <p className="jar-card__month">{monthLabel(key, { month: 'long' })} budget</p>
        <p id="left-label" className="jar-card__left">
          <span className="jar-card__num">{money(overBudget ? 0 : s.leftBudget)}</span>
          <span className="jar-card__unit">left to spend</span>
        </p>

        <div
          className="jar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(leftFrac * 100)}
          aria-label="Budget remaining"
        >
          <div className="jar__fill" style={{ '--left': `${leftFrac * 100}%` }} />
          {s.budget > 0 && (
            <div className="jar__pace" style={{ '--pace': `${(1 - pace) * 100}%` }}>
              <span>today</span>
            </div>
          )}
        </div>

        <div className="jar-card__scale">
          <span>{money(s.spent)} spent</span>
          <span>of {money(s.budget)}</span>
        </div>

        <p className="jar-card__status">{status}</p>
        {!overBudget && s.budget > 0 && (
          <p className="jar-card__daily">
            About <strong>{money(perDay)}</strong> a day for the next {daysLeft} {daysLeft === 1 ? 'day' : 'days'}.
          </p>
        )}
      </section>

      <div className="tiles">
        <div className="tile tile--save">
          <p className="tile__label">Savings</p>
          <p className="tile__value">{money(s.leftSavings)}</p>
          <p className="tile__hint">
            {s.carriedIn > 0 ? `incl. ${money(s.carriedIn)} carried over` : 'unused budget rolls in here'}
          </p>
        </div>
        <div className="tile">
          <p className="tile__label">Today</p>
          <p className="tile__value">{money(todaySpent)}</p>
          <p className="tile__hint">{todayCount === 0 ? 'nothing yet' : `${todayCount} ${todayCount === 1 ? 'expense' : 'expenses'}`}</p>
        </div>
        <div className="tile">
          <p className="tile__label">Most on</p>
          <p className="tile__value tile__value--text">
            {top ? (
              <>
                <span aria-hidden="true">{category(top.name).emoji}</span> {top.name}
              </>
            ) : (
              '—'
            )}
          </p>
          <p className="tile__hint">{top ? money(top.total) : 'no spending yet'}</p>
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <h2>Recent</h2>
          {expenses.length > recent.length && (
            <Link to="/history" className="link-btn">
              See all
            </Link>
          )}
        </div>
        {recent.length ? (
          <GroupedExpenses expenses={recent} />
        ) : (
          <div className="empty">
            <p className="empty__title">Nothing logged yet</p>
            <p>Add what you spend as you go. It takes about five seconds.</p>
            <button className="btn btn--primary" onClick={() => open()}>
              <Plus size={18} strokeWidth={2.5} /> Add your first expense
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
