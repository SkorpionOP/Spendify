import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Repeat, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { monthInsights } from '../lib/insights';
import { currentMonth, cycleDate, dayLabel, monthLabel, shortDate } from '../lib/dates';
import { category as catMeta } from '../lib/categories';
import { compact, money, roundNice, tinyAmount } from '../lib/format';
import { catName, getConfig, t, tn } from '../lib/i18n';
import { payName } from '../lib/payments';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { CategoryIcon } from '../components/CategoryIcon';
import { useExpenseSheet } from '../components/ExpenseSheet';

export default function Insights() {
  const { state } = useStore();
  const [month, setMonth] = useState(currentMonth());
  const [now] = useState(() => new Date());
  const d = useMemo(() => monthInsights(state, month, now), [state, month, now]);
  const isThisMonth = month === currentMonth();
  const hidden = !!state.settings.hideAmounts;

  return (
    <div className={`page insights ${hidden ? 'is-private' : ''}`}>
      <header className="page__head">
        <h1>{t('Insights')}</h1>
        <div className="insights__head-actions">
          {!isThisMonth && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMonth(currentMonth())}>
              {t('This month')}
            </button>
          )}
          <MonthSwitcher value={month} onChange={setMonth} />
        </div>
      </header>
      <Link to="/twin" className="btn btn--ghost btn--sm insights__twin">
        <Sparkles size={16} /> {t('Try a what-if')}
      </Link>

      {d.list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{t('No spending in {month}', { month: monthLabel(month, { month: 'long' }) })}</p>
          <p>{t('Charts appear here once there are expenses for the month.')}</p>
        </div>
      ) : (
        <>
          <PaceCard d={d} />
          <Stats d={d} />
          <WhereItWent d={d} />
          <Habits d={d} />
          <Weekdays d={d} />
          <Payments d={d} />
        </>
      )}
    </div>
  );
}

/* ---------- 1. How is the month going? ---------- */

function PaceCard({ d }) {
  const monthName = monthLabel(d.key, { month: 'long' });
  const prevName = monthLabel(d.prevKey, { month: 'long' });
  const finished = d.elapsed >= d.days;
  const left = d.budget - d.total;

  // Compared with last month at the same day (or in total, once the month is over)
  let compare = null;
  if (d.prevAtSameDay != null && d.prevAtSameDay > 0) {
    const base = finished ? d.prevTotal : d.prevAtSameDay;
    const diff = d.total - base;
    const vars = { amount: money(Math.abs(diff)), month: prevName };
    if (Math.abs(diff) < base * 0.03) compare = { tone: 'same', text: t(finished ? 'about the same as {month}' : 'about the same as {month} at this point', vars) };
    else if (diff < 0) compare = { tone: 'good', text: t(finished ? '{amount} less than {month}' : '{amount} less than {month} at this point', vars) };
    else compare = { tone: 'bad', text: t(finished ? '{amount} more than {month}' : '{amount} more than {month} at this point', vars) };
  }

  let verdict = null;
  if (d.forecast != null && d.budget > 0) {
    verdict =
      d.forecast <= d.budget
        ? { tone: 'good', text: t('forecast-ok', { amount: money(d.forecast), left: money(d.budget - d.forecast) }) }
        : { tone: 'bad', text: t('forecast-over', { amount: money(d.forecast), over: money(d.forecast - d.budget) }) };
  } else if (d.forecast != null) {
    verdict = { tone: 'same', text: t('forecast-plain', { amount: money(d.forecast) }) };
  } else if (finished && d.budget > 0) {
    verdict =
      left >= 0
        ? { tone: 'good', text: t('ended-under', { amount: money(left) }) }
        : { tone: 'bad', text: t('ended-over', { amount: money(-left) }) };
  }

  return (
    <section className="pace" aria-labelledby="pace-title">
      <p id="pace-title" className="pace__label">
        {t('Spent in {month}', { month: monthName })}
      </p>
      <p className="pace__num private-num">{money(d.total)}</p>
      <p className="pace__sub private-num">
        {d.budget > 0 ? t('of your {amount} budget', { amount: money(d.budget) }) : tn(d.list.length, '{n} expense', '{n} expenses')}
      </p>
      {compare && <p className={`pace__compare is-${compare.tone}`}>{compare.text}</p>}

      <PaceChart d={d} />

      <ul className="pace__legend" aria-hidden="true">
        <li>
          <span className="swatch swatch--now" /> {monthName}
        </li>
        {d.prevLine.length > 0 && d.prevTotal > 0 && (
          <li>
            <span className="swatch swatch--prev" /> {prevName}
          </li>
        )}
        {d.budget > 0 && (
          <li>
            <span className="swatch swatch--pace" /> {t('Safe pace')}
          </li>
        )}
      </ul>

      {verdict && <p className={`pace__verdict is-${verdict.tone}`}>{verdict.text}</p>}
    </section>
  );
}

function PaceChart({ d }) {
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const W = 340;
  const H = 168;
  const pad = { t: 14, r: 14, b: 22, l: 6 };
  const prev = d.prevTotal > 0 ? d.prevLine : [];
  const max = Math.max(d.budget, d.total, d.forecast || 0, prev.length ? prev[prev.length - 1].total : 0, 1) * 1.08;
  const x = (day) => pad.l + ((day - 0) / d.days) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const withStart = (pts) => (pts.length ? [{ day: 0, total: 0 }, ...pts] : []);

  const nowPts = withStart(d.line);
  const prevPts = withStart(prev.filter((p) => p.day <= d.days));
  const last = d.line[d.line.length - 1];

  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const svgX = ((e.clientX - r.left) / r.width) * W;
    const day = Math.round(((svgX - pad.l) / (W - pad.l - pad.r)) * d.days);
    setHover(Math.min(d.days, Math.max(1, day)));
  };

  const h = hover;
  const hNow = h != null ? d.line[h - 1] : null;
  const hPrev = h != null ? prev[Math.min(h, prev.length) - 1] : null;
  const ticks = [1, 8, 15, 22, d.days];

  return (
    <div className="pace__chart" onPointerLeave={() => setHover(null)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('Running total for {month}', { month: monthLabel(d.key, { month: 'long' }) })}
        onPointerMove={onMove}
        onPointerDown={onMove}
      >
        <line className="pc__axis" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        {d.budget > 0 && (
          <>
            <line className="pc__pace" x1={x(0)} y1={y(0)} x2={x(d.days)} y2={y(d.budget)} />
            <line className="pc__cap" x1={pad.l} x2={W - pad.r} y1={y(d.budget)} y2={y(d.budget)} />
            <text className="pc__label private-num" x={W - pad.r} y={y(d.budget) - 5} textAnchor="end">
              {compact(d.budget)}
            </text>
          </>
        )}
        {prevPts.length > 1 && <path className="pc__prev" d={path(prevPts)} />}
        {d.forecast != null && last && (
          <line className="pc__forecast" x1={x(last.day)} y1={y(last.total)} x2={x(d.days)} y2={y(d.forecast)} />
        )}
        {nowPts.length > 1 && <path className="pc__now" d={path(nowPts)} />}
        {last && <circle className="pc__dot" cx={x(last.day)} cy={y(last.total)} r={4.5} />}
        {ticks.map((day) => (
          <text key={day} className="pc__tick" x={x(day)} y={H - 6} textAnchor="middle">
            {Number(cycleDate(d.key, day).slice(8))}
          </text>
        ))}
        {h != null && (
          <>
            <line className="pc__cross" x1={x(h)} x2={x(h)} y1={pad.t} y2={y(0)} />
            {hNow && <circle className="pc__dot" cx={x(h)} cy={y(hNow.total)} r={4} />}
            {hPrev && <circle className="pc__dot pc__dot--prev" cx={x(h)} cy={y(hPrev.total)} r={3.5} />}
          </>
        )}
      </svg>
      {h != null && (
        <div className="pc__tip private-num" style={{ left: `${Math.min(70, Math.max(30, (x(h) / W) * 100))}%` }}>
          <strong>{shortDate(cycleDate(d.key, h))}</strong>
          {hNow ? (
            <>
              <span>{t('That day: {amount}', { amount: money(hNow.spent) })}</span>
              <span>{t('So far: {amount}', { amount: money(hNow.total) })}</span>
            </>
          ) : (
            <span>{t('Not yet')}</span>
          )}
          {hPrev && <span className="pc__tip-prev">{t('{month}: {amount}', { month: monthLabel(d.prevKey, { month: 'short' }), amount: money(hPrev.total) })}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- 2. Three small numbers ---------- */

function Stats({ d }) {
  const open = useExpenseSheet();
  return (
    <div className="stats">
      <div className="stat">
        <span className="stat__label">{t('Per day')}</span>
        <span className="stat__value private-num">{compact(d.perDay)}</span>
        <span className="stat__hint">{t('on average')}</span>
      </div>
      <div className="stat">
        <span className="stat__label">{t('No-spend days')}</span>
        <span className="stat__value">{d.noSpendDays}</span>
        <span className="stat__hint">{tn(d.elapsed, 'of {n} day', 'of {n} days')}</span>
      </div>
      <button className="stat stat--btn" onClick={() => d.biggest && open(d.biggest)}>
        <span className="stat__label">{t('Biggest')}</span>
        <span className="stat__value private-num">{compact(d.biggest.amount)}</span>
        <span className="stat__hint">{d.biggest.note || catName(d.biggest.category)}</span>
      </button>
    </div>
  );
}

/* ---------- 3. Where it went ---------- */

function WhereItWent({ d }) {
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const openSheet = useExpenseSheet();
  const top = d.categories[0]?.total || 1;
  const shown = all ? d.categories : d.categories.slice(0, 6);
  const prevShort = monthLabel(d.prevKey, { month: 'short' });

  return (
    <section className="section" aria-labelledby="where-title">
      <div className="section__head">
        <h2 id="where-title">{t('Where it went')}</h2>
      </div>
      <div className="ribbon" aria-hidden="true">
        {d.categories.map((c) => (
          <span key={c.name} style={{ flexGrow: c.total, background: catMeta(c.name).color }} />
        ))}
      </div>
      <ul className="where">
        {shown.map((c) => {
          const share = Math.round((c.total / d.total) * 100);
          const isOpen = open === c.name;
          const over = c.limit > 0 && c.total > c.limit;
          const diff = c.total - c.prevTotal;
          return (
            <li key={c.name} className={`where__item ${isOpen ? 'is-open' : ''}`}>
              <button className="where__row" onClick={() => setOpen(isOpen ? null : c.name)} aria-expanded={isOpen}>
                <span className="where__icon" style={{ '--cat': catMeta(c.name).color }} aria-hidden="true">
                  <CategoryIcon name={c.name} size={18} color={catMeta(c.name).color} />
                </span>
                <span className="where__body">
                  <span className="where__top">
                    <span className="where__name">{catName(c.name)}</span>
                    <span className="where__amt private-num">{money(c.total)}</span>
                  </span>
                  <span className="where__bar" aria-hidden="true">
                    <span style={{ width: `${(c.total / top) * 100}%`, background: catMeta(c.name).color }} />
                  </span>
                  <span className="where__meta private-num">
                    {share}%, {tn(c.count, '{n} expense', '{n} expenses')}
                    {c.prevTotal > 0 && Math.abs(diff) >= c.prevTotal * 0.05
                      ? `, ${t(diff > 0 ? '{amount} more than {month}' : '{amount} less than {month}', { amount: money(Math.abs(diff)), month: prevShort })}`
                      : ''}
                    {c.limit > 0 && (
                      <span className={over ? 'where__limit is-over' : 'where__limit'}>
                        {', '}
                        {over
                          ? t('{amount} over the limit', { amount: money(c.total - c.limit) })
                          : t('limit {amount}', { amount: money(c.limit) })}
                      </span>
                    )}
                  </span>
                </span>
                {isOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
              </button>
              {isOpen && (
                <ul className="where__items">
                  {c.items.slice(0, 8).map((e) => (
                    <li key={e.id}>
                      <button onClick={() => openSheet(e)}>
                        <span className="where__item-name">
                          {e.note || catName(e.category)}
                          {e.recurringId && <Repeat size={12} className="inline-icon" aria-label={t('Monthly repeat')} />}
                        </span>
                        <span className="where__item-date">{dayLabel(e.date)}</span>
                        <span className="where__item-amt private-num">{money(e.amount)}</span>
                      </button>
                    </li>
                  ))}
                  {c.items.length > 8 && <li className="muted small">{t('and {n} more in History', { n: c.items.length - 8 })}</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {d.categories.length > 6 && (
        <button className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? t('Show fewer') : t('Show all {n} categories', { n: d.categories.length })}
        </button>
      )}
    </section>
  );
}

/* ---------- 4. Small habits ---------- */

function Habits({ d }) {
  if (!d.habits.length) return null;
  const [first] = d.habits;
  return (
    <section className="section" aria-labelledby="habits-title">
      <div className="section__head">
        <h2 id="habits-title">{t('Small habits')}</h2>
      </div>
      <p className="muted small section__intro">{t('habits-intro')}</p>
      <ul className="habits">
        {d.habits.map((h) => (
          <li key={h.note} className="habit">
            <CategoryIcon name={h.category} size={18} color={catMeta(h.category).color} />
            <span className="habit__name">{h.note}</span>
            <span className="habit__count">×{h.count}</span>
            <span className="habit__amt private-num">{money(h.total)}</span>
          </li>
        ))}
      </ul>
      <p className="habits__tip private-num">{t('habit-tip', { note: first.note, amount: money(roundNice(first.total / 2)) })}</p>
    </section>
  );
}

/* ---------- 5. Which day costs the most ---------- */

const weekdayName = (i, style) =>
  // 1 Jan 2024 was a Monday
  new Date(2024, 0, 1 + i).toLocaleDateString(getConfig().locale, { weekday: style });

function Weekdays({ d }) {
  if (!d.peakWeekday) return null;
  const max = Math.max(...d.weekdays.map((w) => w.avg), 1);
  return (
    <section className="section" aria-labelledby="week-title">
      <div className="section__head">
        <h2 id="week-title">{t('Your priciest day')}</h2>
      </div>
      <p className="weekday__line private-num">
        {t('weekday-peak', { day: weekdayName(d.peakWeekday.index, 'long'), amount: money(roundNice(d.peakWeekday.avg)) })}
      </p>
      <div className="weekday" role="img" aria-label={t('Average spending per weekday, last 8 weeks')}>
        {d.weekdays.map((w) => (
          <div key={w.index} className={`weekday__col ${w === d.peakWeekday ? 'is-peak' : ''}`}>
            <span className="weekday__val private-num">{w.avg ? tinyAmount(w.avg) : ''}</span>
            <span className="weekday__bar">
              <span style={{ height: `${Math.max(3, (w.avg / max) * 100)}%` }} />
            </span>
            <span className="weekday__day">{weekdayName(w.index, 'short')}</span>
          </div>
        ))}
      </div>
      <p className="muted small">{t('Average of the last 8 weeks, without monthly repeats.')}</p>
    </section>
  );
}

/* ---------- 6. Paid with ---------- */

function Payments({ d }) {
  if (!d.payments.length) return null;
  const total = d.payments.reduce((s, p) => s + p.amount, 0);
  return (
    <section className="section" aria-labelledby="pay-title">
      <div className="section__head">
        <h2 id="pay-title">{t('Paid with')}</h2>
      </div>
      <ul className="pays">
        {d.payments.map((p) => (
          <li key={p.id} className="pay">
            <span className="pay__name">{payName(p.id)}</span>
            <span className="pay__bar" aria-hidden="true">
              <span style={{ width: `${(p.amount / d.payments[0].amount) * 100}%` }} />
            </span>
            <span className="pay__amt private-num">{money(p.amount)}</span>
          </li>
        ))}
      </ul>
      {total < d.total && <p className="muted small">{t('{amount} has no payment method.', { amount: money(d.total - total) })}</p>}
    </section>
  );
}

