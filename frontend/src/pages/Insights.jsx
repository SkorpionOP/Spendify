import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Flame,
  Info,
  PieChart,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { monthSummary, useStore } from '../lib/store';
import { addMonths, currentMonth, dayLabel, daysInMonth, monthKey, monthLabel } from '../lib/dates';
import { category } from '../lib/categories';
import { money } from '../lib/format';
import { catName, t, tn } from '../lib/i18n';
import { MonthSwitcher } from '../components/MonthSwitcher';

const NEEDS_CATEGORIES = new Set([
  'Food',
  'Groceries',
  'Transport',
  'Bills',
  'Rent',
  'Phone',
  'Health',
  'Education',
  'Family',
  'Investment',
  'Charity',
]);

export default function Insights() {
  const { state, expenses } = useStore();
  const [month, setMonth] = useState(currentMonth());
  const [chartMode, setChartMode] = useState('daily'); // 'daily' | 'cumulative'
  const [expandedCat, setExpandedCat] = useState(null);

  const curMonth = currentMonth();
  const isCurrentMonth = month === curMonth;

  const data = useMemo(() => {
    const list = expenses.filter((e) => monthKey(e.date) === month);
    const prevKey = addMonths(month, -1);
    const prevList = expenses.filter((e) => monthKey(e.date) === prevKey);
    const prev = prevList.reduce((s, e) => s + e.amount, 0);
    const total = list.reduce((s, e) => s + e.amount, 0);

    const cats = {};
    for (const e of list) {
      if (!cats[e.category]) cats[e.category] = { name: e.category, total: 0, count: 0, items: [] };
      cats[e.category].total += e.amount;
      cats[e.category].count++;
      cats[e.category].items.push(e);
    }
    const categories = Object.values(cats).sort((a, b) => b.total - a.total);

    const n = daysInMonth(month);
    const daily = Array.from({ length: n }, (_, i) => ({
      day: i + 1,
      date: `${month}-${String(i + 1).padStart(2, '0')}`,
      total: 0,
      count: 0,
    }));
    for (const e of list) {
      const idx = Number(e.date.slice(8)) - 1;
      if (daily[idx]) {
        daily[idx].total += e.amount;
        daily[idx].count++;
      }
    }

    // Cumulative spending day by day
    let run = 0;
    const cumulative = daily.map((d) => {
      run += d.total;
      return { ...d, cum: run };
    });

    // Needs vs Wants vs Repeats breakdown
    let needsTotal = 0;
    let wantsTotal = 0;
    let repeatsTotal = 0;
    let repeatsCount = 0;

    for (const e of list) {
      if (e.recurringId) {
        repeatsTotal += e.amount;
        repeatsCount++;
      }
      if (NEEDS_CATEGORIES.has(e.category)) {
        needsTotal += e.amount;
      } else {
        wantsTotal += e.amount;
      }
    }

    const elapsed = isCurrentMonth ? Math.min(n, new Date().getDate()) : n;
    const daysLeft = Math.max(1, n - elapsed + 1);
    const biggest = list.reduce((m, e) => (!m || e.amount > m.amount ? e : m), null);
    const summary = monthSummary(state, month);
    const activeDaysCount = daily.filter((d) => d.total > 0).length;

    const peakDay = daily.reduce((m, d) => (!m || d.total > m.total ? d : m), null);

    return {
      list,
      total,
      prev,
      prevKey,
      categories,
      daily,
      cumulative,
      elapsed,
      daysLeft,
      biggest,
      summary,
      activeDaysCount,
      peakDay,
      needsTotal,
      wantsTotal,
      repeatsTotal,
      repeatsCount,
    };
  }, [expenses, month, state, isCurrentMonth]);

  const budget = data.summary?.budget || 0;
  const spent = data.total;
  const usage = budget > 0 ? spent / budget : 0;
  const isOver = budget > 0 && spent > budget;
  const isNear = !isOver && budget > 0 && usage >= 0.8;
  const fromSavings = data.summary?.fromSavings || 0;
  const leftBudget = data.summary?.leftBudget || 0;

  const delta = data.prev > 0 ? ((data.total - data.prev) / data.prev) * 100 : null;
  const perDayBudget = data.summary?.budget ? data.summary.budget / data.daily.length : 0;
  const dailyAverage = data.total / Math.max(1, data.activeDaysCount || 1);

  const prevMonthName = monthLabel(data.prevKey, { month: 'short' });

  return (
    <div className="page">
      <header className="page__head">
        <h1>{t('Insights')}</h1>
        <div className="insights__head-actions">
          {!isCurrentMonth && (
            <button
              type="button"
              className="btn btn--ghost btn--sm insights__today-btn"
              onClick={() => setMonth(curMonth)}
            >
              {t('This month')}
            </button>
          )}
          <MonthSwitcher value={month} onChange={setMonth} />
        </div>
      </header>

      {data.list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{t('No spending in {month}', { month: monthLabel(month, { month: 'long' }) })}</p>
          <p>{t('Charts appear here once there are expenses for the month.')}</p>
        </div>
      ) : (
        <>
          {/* Financial Health Verdict Banner */}
          <section className={`card insights__verdict ${isOver ? 'is-over' : isNear ? 'is-warn' : 'is-ok'}`}>
            <div className="verdict__top">
              <span
                className={`verdict__badge ${
                  isOver
                    ? 'verdict__badge--danger'
                    : isNear
                      ? 'verdict__badge--warn'
                      : budget > 0
                        ? 'verdict__badge--success'
                        : 'verdict__badge--neutral'
                }`}
              >
                {isOver ? (
                  <>
                    <AlertCircle size={14} /> {t('Over budget')}
                  </>
                ) : isNear ? (
                  <>
                    <Flame size={14} /> {t('Near budget limit')}
                  </>
                ) : budget > 0 ? (
                  <>
                    <CheckCircle2 size={14} /> {t('On track')}
                  </>
                ) : (
                  <>
                    <Info size={14} /> {t('Financial health')}
                  </>
                )}
              </span>
              {budget > 0 && (
                <span className="small muted font-semibold">
                  {Math.round(usage * 100)}% {t('of {amount} budget', { amount: money(budget) })}
                </span>
              )}
            </div>

            <p className="verdict__headline">
              {isOver ? (
                <span>
                  {t('Over budget by {amount}', { amount: money(fromSavings) })}.{' '}
                  {t('The extra spending was funded from your savings.')}
                </span>
              ) : isNear ? (
                <span>
                  <strong>{Math.round(usage * 100)}%</strong> {t('of your budget is used with {daysLeft} days remaining.', { daysLeft: data.daysLeft })}
                </span>
              ) : budget > 0 ? (
                <span>
                  <strong>{money(leftBudget)}</strong> {t('remaining in your budget.')}{' '}
                  {isCurrentMonth ? `(~${money(leftBudget / data.daysLeft)} / day)` : ''}
                </span>
              ) : (
                <span>{t('{amount} logged across {n} expenses.', { amount: money(spent), n: data.list.length })}</span>
              )}
            </p>

            {budget > 0 && (
              <div className="insights__gauge" aria-hidden="true">
                <div className="gauge__track">
                  <div
                    className={`gauge__fill ${isOver ? 'is-over' : isNear ? 'is-warn' : ''}`}
                    style={{ width: `${Math.min(100, usage * 100)}%` }}
                  />
                  {isOver && (
                    <div
                      className="gauge__over"
                      style={{ width: `${Math.min(100, (fromSavings / budget) * 100)}%` }}
                    />
                  )}
                </div>
                <div className="gauge__labels">
                  <span>{t('Spent')}: {money(spent)}</span>
                  {isOver ? (
                    <span className="is-danger">+{money(fromSavings)} {t('from savings')}</span>
                  ) : (
                    <span>{money(leftBudget)} {t('remaining')}</span>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 4 Core Financial Metrics */}
          <div className="insights__metrics">
            <div className="metric-card">
              <div className="metric-card__head">
                <Wallet size={15} />
                <span>{t('Spent')}</span>
              </div>
              <p className="metric-card__val">{money(data.total)}</p>
              <p className={`metric-card__sub ${delta != null ? (delta > 0 ? 'is-up' : 'is-down') : ''}`}>
                {delta != null ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {delta > 0 ? '+' : ''}{Math.round(delta)}% vs {prevMonthName}
                  </span>
                ) : (
                  t('nothing logged in {month}', { month: prevMonthName })
                )}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card__head">
                <Calendar size={15} />
                <span>{t('Daily average')}</span>
              </div>
              <p className="metric-card__val">{money(dailyAverage)}</p>
              <p className="metric-card__sub">
                {data.activeDaysCount} {t('active days with spending')}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card__head">
                <CreditCard size={15} />
                <span>{t('Budget used')}</span>
              </div>
              <p className="metric-card__val">{budget > 0 ? `${Math.round(usage * 100)}%` : '—'}</p>
              <p className="metric-card__sub">
                {budget > 0
                  ? isOver
                    ? `+${money(fromSavings)} ${t('from savings')}`
                    : `${money(leftBudget)} ${t('remaining')}`
                  : t('no budget set')}
              </p>
            </div>

            <div className="metric-card">
              <div className="metric-card__head">
                <Flame size={15} />
                <span>{t('Biggest spend')}</span>
              </div>
              <p className="metric-card__val">{data.biggest ? money(data.biggest.amount) : '—'}</p>
              <p className="metric-card__sub">
                {data.biggest ? `${data.biggest.note || catName(data.biggest.category)} • ${dayLabel(data.biggest.date)}` : t('no spending yet')}
              </p>
            </div>
          </div>

          {/* Needs vs Wants vs Repeats Split */}
          <section className="insights__splits">
            <div className="splits__head">
              <span>{t('Spending breakdown')}</span>
              <span className="small muted font-semibold">{data.list.length} {t('Total transactions')}</span>
            </div>
            <div className="splits__bar" aria-hidden="true">
              <div
                className="splits__bar-segment splits__bar-segment--needs"
                style={{ width: `${spent > 0 ? (data.needsTotal / spent) * 100 : 0}%` }}
                title={`${t('Essentials & Needs')}: ${money(data.needsTotal)}`}
              />
              <div
                className="splits__bar-segment splits__bar-segment--wants"
                style={{ width: `${spent > 0 ? (data.wantsTotal / spent) * 100 : 0}%` }}
                title={`${t('Flexible & Wants')}: ${money(data.wantsTotal)}`}
              />
            </div>
            <div className="splits__pills">
              <div className="split-pill">
                <span className="split-pill__dot split-pill__dot--needs" />
                <span className="split-pill__label">{t('Essentials & Needs')}:</span>
                <span className="split-pill__amt">{money(data.needsTotal)} ({spent > 0 ? Math.round((data.needsTotal / spent) * 100) : 0}%)</span>
              </div>
              <div className="split-pill">
                <span className="split-pill__dot split-pill__dot--wants" />
                <span className="split-pill__label">{t('Flexible & Wants')}:</span>
                <span className="split-pill__amt">{money(data.wantsTotal)} ({spent > 0 ? Math.round((data.wantsTotal / spent) * 100) : 0}%)</span>
              </div>
              {data.repeatsTotal > 0 && (
                <div className="split-pill">
                  <span className="split-pill__dot split-pill__dot--repeats" />
                  <span className="split-pill__label" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Repeat size={11} aria-hidden="true" />
                    {t('Monthly Repeats')}:
                  </span>
                  <span className="split-pill__amt">{money(data.repeatsTotal)}</span>
                </div>
              )}
            </div>
          </section>

          {/* Interactive Spending Trend Chart (Daily vs Cumulative) */}
          <section className="insights__chart-card">
            <div className="chart-card__head">
              <h2 className="chart-card__title">{t('Spending trend')}</h2>
              <div className="chart-toggle" role="radiogroup" aria-label={t('Spending trend')}>
                <button
                  type="button"
                  className={`chart-toggle__btn ${chartMode === 'daily' ? 'is-active' : ''}`}
                  onClick={() => setChartMode('daily')}
                >
                  {t('Daily spend')}
                </button>
                <button
                  type="button"
                  className={`chart-toggle__btn ${chartMode === 'cumulative' ? 'is-active' : ''}`}
                  onClick={() => setChartMode('cumulative')}
                >
                  {t('Running total')}
                </button>
              </div>
            </div>

            <InteractiveChart
              mode={chartMode}
              daily={data.daily}
              cumulative={data.cumulative}
              perDayBudget={perDayBudget}
              totalBudget={budget}
            />

            <div className="chart-legend" aria-hidden="true">
              {chartMode === 'daily' ? (
                <>
                  <div className="chart-legend__item">
                    <span className="chart-legend__box" /> {t('Over daily target')}
                  </div>
                  {perDayBudget > 0 && (
                    <div className="chart-legend__item">
                      <span className="chart-legend__dash" /> {t('daily budget {amount}', { amount: money(perDayBudget) })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="chart-legend__item">
                    <span className="chart-legend__dash" /> {t('Target pace')}
                  </div>
                  <div className="chart-legend__item">
                    <span className="chart-legend__box" style={{ background: '#3b82f6' }} /> {t('Cumulative spend')}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Category Distribution ("Where it went") */}
          <section className="card section">
            <div className="section__head">
              <h2>{t('Where it went')}</h2>
              <span className="small muted font-semibold">
                {data.categories.length} {t('categories')}
              </span>
            </div>

            {/* Top Color Ribbon */}
            <div className="cat-ribbon" aria-hidden="true">
              {data.categories.map((c) => {
                const meta = category(c.name);
                const pct = spent > 0 ? (c.total / spent) * 100 : 0;
                return (
                  <div
                    key={c.name}
                    className="cat-ribbon__segment"
                    style={{ width: `${pct}%`, background: meta.color }}
                    title={`${catName(c.name)}: ${Math.round(pct)}%`}
                  />
                );
              })}
            </div>

            {/* Interactive Category List */}
            <div className="cat-list">
              {data.categories.map((c) => {
                const meta = category(c.name);
                const share = spent > 0 ? c.total / spent : 0;
                const isExpanded = expandedCat === c.name;
                const pct = Math.round(share * 100);

                return (
                  <div key={c.name} className={`cat-item ${isExpanded ? 'is-expanded' : ''}`}>
                    <button
                      type="button"
                      className="cat-item__btn"
                      onClick={() => setExpandedCat(isExpanded ? null : c.name)}
                      aria-expanded={isExpanded}
                    >
                      <div className="cat-item__icon" style={{ '--cat': meta.color }} aria-hidden="true">
                        {meta.emoji}
                      </div>

                      <div className="cat-item__body">
                        <div className="cat-item__top">
                          <span className="cat-item__name">
                            {catName(c.name)}
                            <span className="cat-item__count">
                              ({tn(c.count, '{n} expense', '{n} expenses')})
                            </span>
                          </span>

                          <div className="cat-item__amt-col">
                            <span className="cat-item__amt">{money(c.total)}</span>
                            <span className="cat-item__pct">{pct}%</span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        <div className="cat-item__bar" aria-hidden="true">
                          <div
                            className="cat-item__bar-fill"
                            style={{
                              width: `${(c.total / data.categories[0].total) * 100}%`,
                              background: meta.color,
                            }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Expandable list of transactions */}
                    {isExpanded && (
                      <div className="cat-item__txs">
                        {c.items.slice(0, 10).map((item) => (
                          <div key={item.id} className="cat-item__tx">
                            <span className="cat-item__tx-name">
                              {item.note || catName(item.category)} • {dayLabel(item.date)}
                            </span>
                            <span className="cat-item__tx-amt">{money(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Key Highlights of the Month */}
          <section className="insights__highlights">
            <h2 className="highlights__title">
              <PieChart size={18} />
              {t('Key Highlights')}
            </h2>
            <ul className="highlights__list">
              {data.categories[0] && (
                <li className="highlight-item">
                  <span className="highlight-item__icon">🛵</span>
                  <div className="highlight-item__text">
                    {t('Top category was {cat} ({pct}% of total)', {
                      cat: catName(data.categories[0].name),
                      pct: String(Math.round((data.categories[0].total / spent) * 100)),
                    })}
                    , totaling <strong>{money(data.categories[0].total)}</strong>.
                  </div>
                </li>
              )}
              {data.peakDay && data.peakDay.total > 0 && (
                <li className="highlight-item">
                  <span className="highlight-item__icon">📅</span>
                  <div className="highlight-item__text">
                    {t('Highest spending was on {date} ({amount})', {
                      date: dayLabel(data.peakDay.date),
                      amount: money(data.peakDay.total),
                    })}
                    .
                  </div>
                </li>
              )}
              {data.repeatsCount > 0 && (
                <li className="highlight-item">
                  <span className="highlight-item__icon">🔄</span>
                  <div className="highlight-item__text">
                    {t('{n} recurring bills accounted for {amount}', {
                      n: data.repeatsCount,
                      amount: money(data.repeatsTotal),
                    })}
                    .
                  </div>
                </li>
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function InteractiveChart({ mode, daily, cumulative, perDayBudget, totalBudget }) {
  const [hover, setHover] = useState(null);
  const W = 640;
  const H = 190;
  const pad = { t: 20, r: 12, b: 24, l: 12 };

  if (mode === 'cumulative') {
    const max = Math.max(totalBudget || 1, cumulative[cumulative.length - 1]?.cum || 1) * 1.1;
    const n = cumulative.length;
    const bw = (W - pad.l - pad.r) / Math.max(1, n - 1);
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
    const base = y(0);

    const points = cumulative.map((d, i) => `${pad.l + i * bw},${y(d.cum)}`).join(' ');
    const area = `${pad.l},${base} ${points} ${pad.l + (n - 1) * bw},${base}`;

    const active = hover != null ? cumulative[hover] : null;

    return (
      <div className="chart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Running total')}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="chart__axis" />

          {/* Target budget trajectory line */}
          {totalBudget > 0 && (
            <line
              x1={pad.l}
              y1={y(0)}
              x2={W - pad.r}
              y2={y(totalBudget)}
              className="chart__ref"
            />
          )}

          {/* Area fill */}
          <polygon points={area} className="chart__curve-area" />

          {/* Curve */}
          <polyline
            points={points}
            className={`chart__curve ${totalBudget > 0 && cumulative[cumulative.length - 1]?.cum > totalBudget ? 'is-over' : ''}`}
          />

          {/* Interaction hit zones */}
          {cumulative.map((d, i) => {
            const x = pad.l + i * bw;
            return (
              <g key={d.day}>
                <rect
                  x={x - bw / 2}
                  y={pad.t}
                  width={bw}
                  height={H - pad.t}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                />
                {(d.day === 1 || d.day % 5 === 0) && (
                  <text x={x} y={H - 6} className="chart__tick" textAnchor="middle">
                    {d.day}
                  </text>
                )}
                {hover === i && (
                  <circle cx={x} cy={y(d.cum)} r={4.5} fill="#3b82f6" stroke="var(--paper)" strokeWidth={2} />
                )}
              </g>
            );
          })}
        </svg>

        {active && (
          <div className="chart__tip">
            <strong>{money(active.cum)}</strong>
            <span>{dayLabel(active.date)} ({t('Total so far')})</span>
          </div>
        )}
      </div>
    );
  }

  // Daily Mode
  const max = Math.max(perDayBudget * 1.15, ...daily.map((d) => d.total), 1);
  const bw = (W - pad.l - pad.r) / daily.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const base = y(0);
  const active = hover != null ? daily[hover] : null;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Spending per day this month')}>
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="chart__axis" />

        {/* Daily bars */}
        {daily.map((d, i) => {
          const h = base - y(d.total);
          const x = pad.l + i * bw;
          return (
            <g key={d.day}>
              {d.total > 0 && (
                <rect
                  x={x + 1}
                  y={base - h}
                  width={Math.max(2, bw - 2)}
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

        {/* Daily budget line */}
        {perDayBudget > 0 && (
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(perDayBudget)}
            y2={y(perDayBudget)}
            className="chart__ref"
          />
        )}
      </svg>

      {active && (
        <div className="chart__tip">
          <strong>{active.total ? money(active.total) : t('Nothing')}</strong>
          <span>
            {dayLabel(active.date)}
            {active.count > 0 ? ` • ${tn(active.count, '{n} expense', '{n} expenses')}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
