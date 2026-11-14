import { useMemo, useState } from 'react';
import { monthSummary, useStore } from '../lib/store';
import { addMonths, currentMonth, daysInMonth, dayLabel, monthKey, monthLabel } from '../lib/dates';
import { category } from '../lib/categories';
import { compact, money } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { MonthSwitcher } from '../components/MonthSwitcher';

export default function Insights() {
  const { state, expenses } = useStore();
  const [month, setMonth] = useState(currentMonth());

  const data = useMemo(() => {
    const list = expenses.filter((e) => monthKey(e.date) === month);
    const prevKey = addMonths(month, -1);
    const prev = expenses.filter((e) => monthKey(e.date) === prevKey).reduce((s, e) => s + e.amount, 0);
    const total = list.reduce((s, e) => s + e.amount, 0);

    const cats = {};
    for (const e of list) (cats[e.category] ||= { name: e.category, total: 0, count: 0 }).total += e.amount;
    for (const e of list) cats[e.category].count++;
    const categories = Object.values(cats).sort((a, b) => b.total - a.total);

    const n = daysInMonth(month);
    const daily = Array.from({ length: n }, (_, i) => ({ day: i + 1, date: `${month}-${String(i + 1).padStart(2, '0')}`, total: 0 }));
    for (const e of list) daily[Number(e.date.slice(8)) - 1].total += e.amount;

    const elapsed = month === currentMonth() ? new Date().getDate() : n;
    const biggest = list.reduce((m, e) => (!m || e.amount > m.amount ? e : m), null);
    const summary = monthSummary(state, month);

    return { list, total, prev, categories, daily, elapsed, biggest, summary };
  }, [expenses, month, state]);

  const delta = data.prev > 0 ? ((data.total - data.prev) / data.prev) * 100 : null;
  const perDayBudget = data.summary ? data.summary.budget / data.daily.length : 0;

  return (
    <div className="page">
      <header className="page__head">
        <h1>{t('Insights')}</h1>
        <MonthSwitcher value={month} onChange={setMonth} />
      </header>

      <div className="tiles tiles--2">
        <div className="tile">
          <p className="tile__label">{t('Spent')}</p>
          <p className="tile__value">{money(data.total)}</p>
          <p className="tile__hint">
            {delta === null
              ? t('nothing logged in {month}', { month: monthLabel(addMonths(month, -1), { month: 'long' }) })
              : t(delta >= 0 ? '{pct}% more than {month}' : '{pct}% less than {month}', {
                  pct: Math.abs(delta).toFixed(0),
                  month: monthLabel(addMonths(month, -1), { month: 'long' }),
                })}
          </p>
        </div>
        <div className="tile">
          <p className="tile__label">{t('Daily average')}</p>
          <p className="tile__value">{money(data.total / Math.max(1, data.elapsed))}</p>
          <p className="tile__hint">{t('over {n} days', { n: data.elapsed })}</p>
        </div>
        <div className="tile">
          <p className="tile__label">{t('Budget used')}</p>
          <p className="tile__value">{data.summary?.budget ? `${Math.round(data.summary.usage * 100)}%` : '—'}</p>
          <p className="tile__hint">{t('of {amount}', { amount: money(data.summary?.budget || 0) })}</p>
        </div>
        <div className="tile">
          <p className="tile__label">{t('Biggest spend')}</p>
          <p className="tile__value">{data.biggest ? money(data.biggest.amount) : '—'}</p>
          <p className="tile__hint">
            {data.biggest ? `${data.biggest.note || catName(data.biggest.category)}, ${dayLabel(data.biggest.date)}` : t('no spending yet')}
          </p>
        </div>
      </div>

      {data.list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{t('No spending in {month}', { month: monthLabel(month, { month: 'long' }) })}</p>
          <p>{t('Charts appear here once there are expenses for the month.')}</p>
        </div>
      ) : (
        <>
          <section className="card section">
            <div className="section__head">
              <h2>{t('Day by day')}</h2>
              <span className="legend">
                <span className="legend__line" /> {t('daily budget {amount}', { amount: money(perDayBudget) })}
              </span>
            </div>
            <DailyChart daily={data.daily} perDayBudget={perDayBudget} />
          </section>

          <section className="card section">
            <div className="section__head">
              <h2>{t('Where it went')}</h2>
            </div>
            <table className="cat-table">
              <caption className="sr-only">{t('Spending by category')}</caption>
              <thead className="sr-only">
                <tr>
                  <th>{t('Category')}</th>
                  <th>{t('Amount')}</th>
                  <th>{t('Share')}</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => {
                  const share = c.total / data.total;
                  const meta = category(c.name);
                  return (
                    <tr key={c.name}>
                      <th scope="row">
                        <span className="cat-table__name">
                          <span className="tx__icon tx__icon--sm" style={{ '--cat': meta.color }} aria-hidden="true">
                            {meta.emoji}
                          </span>
                          <span>
                            {catName(c.name)}
                            <span className="cat-table__count">
                              {tn(c.count, '{n} expense', '{n} expenses')}
                            </span>
                          </span>
                        </span>
                        <span className="cat-table__bar" aria-hidden="true">
                          <span style={{ width: `${(c.total / data.categories[0].total) * 100}%` }} />
                        </span>
                      </th>
                      <td className="cat-table__amt">{money(c.total)}</td>
                      <td className="cat-table__pct">{Math.round(share * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function DailyChart({ daily, perDayBudget }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 180;
  const pad = { t: 12, r: 8, b: 22, l: 8 };
  const max = Math.max(perDayBudget * 1.15, ...daily.map((d) => d.total), 1);
  const bw = (W - pad.l - pad.r) / daily.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const base = y(0);
  const active = hover != null ? daily[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Spending per day this month')}>
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="chart__axis" />
        {daily.map((d, i) => {
          const h = base - y(d.total);
          const x = pad.l + i * bw;
          return (
            <g key={d.day}>
              {d.total > 0 && (
                <rect
                  x={x + 1}
                  y={base - h}
                  width={Math.max(1, bw - 2)}
                  height={h}
                  rx={Math.min(4, (bw - 2) / 2)}
                  className={`chart__bar ${d.total > perDayBudget && perDayBudget > 0 ? 'is-over' : ''} ${hover === i ? 'is-hover' : ''}`}
                />
              )}
              <rect
                x={x}
                y={pad.t}
                width={bw}
                height={H - pad.t}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
              {(d.day === 1 || d.day % 5 === 0) && (
                <text x={x + bw / 2} y={H - 6} className="chart__tick" textAnchor="middle">
                  {d.day}
                </text>
              )}
            </g>
          );
        })}
        {perDayBudget > 0 && (
          <line x1={pad.l} x2={W - pad.r} y1={y(perDayBudget)} y2={y(perDayBudget)} className="chart__ref" />
        )}
      </svg>
      {active && (
        <div className="chart__tip" style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}>
          <strong>{active.total ? money(active.total) : t('Nothing')}</strong>
          <span>{dayLabel(active.date)}</span>
        </div>
      )}
      <p className="sr-only">
        {compact(Math.max(...daily.map((d) => d.total)))}
      </p>
    </div>
  );
}
