import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Bookmark, Check, ChevronLeft, Mic, MicOff, PiggyBank, Sparkles, Trash2, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { simulate } from '../lib/twin';
import { clauses, understand } from '../lib/nlu';
import { askAI } from '../lib/ai';
import { buildContext } from '../lib/aicontext';
import { localAnswer, looksLikeQuestion } from '../lib/localanswer';
import { cleanChange } from '../lib/changes';
import { addMonths, monthLabel } from '../lib/dates';
import { amountToInput, compact, currencySymbol, formatAmountInput, money, parseAmountInput, roundUpNice } from '../lib/format';
import { catName, getConfig, t, tn } from '../lib/i18n';
import { useToast } from '../components/Toasts';

const EXAMPLES = ['ex-analyze', 'ex-improve', 'ex-goal', 'ex-buy', 'ex-cut', 'ex-income'];

const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const signed = (n) => (n < 0 ? `−${money(-n)}` : money(n));

/** Plain-language line for one understood change. */
const describe = (c) => {
  switch (c.type) {
    case 'purchase': {
      const when = c.at === 1 ? t('next month') : c.at > 1 ? t('in {n} months', { n: c.at }) : t('this month');
      return t('Buy {name} for {amount}, {when}', { name: c.name || t('something'), amount: money(c.amount), when });
    }
    case 'save':
      return t('Save {amount} more every month', { amount: money(c.amount) });
    case 'cut':
      if (c.pct === 1) return t('Stop spending on {category}', { category: catName(c.category) });
      if (c.pct != null) return t('Spend {pct}% less on {category}', { pct: Math.round(c.pct * 100), category: catName(c.category) }) + (c.assumed ? ` ${t('(I guessed 20%)')}` : '');
      return t('Spend {amount} less on {category} a month', { amount: money(c.amount), category: catName(c.category) });
    case 'income':
      if (c.set != null) return t('Income becomes {amount}', { amount: money(c.set) });
      if (c.pct != null) return t(c.pct < 0 ? 'Income drops {pct}%' : 'Income goes up {pct}%', { pct: Math.round(Math.abs(c.pct) * 100) });
      return t(c.delta < 0 ? 'Income drops by {amount}' : 'Income goes up by {amount}', { amount: money(Math.abs(c.delta)) });
    case 'monthly':
      return (
        t('{name} {amount} a month', { name: c.name || t('New cost'), amount: money(c.amount) }) +
        (c.months ? `, ${tn(c.months, 'for {n} month', 'for {n} months')}` : '')
      );
    case 'target':
      return t('When will I have {amount}?', { amount: money(c.amount) });
    case 'goal':
      return c.months
        ? t('Save {amount} for {name} in {n} months', { amount: money(c.amount), name: c.name || t('something'), n: c.months })
        : t('Save {amount} for {name}', { amount: money(c.amount), name: c.name || t('something') });
    default:
      return '';
  }
};

/* ---------- reply text: short paragraphs, "- " bullets and **bold**, rendered without innerHTML ---------- */

const inline = (s) =>
  s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));

function RichReply({ text }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const bullet = l.match(/^[-•*]\s+(.*)/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else blocks.push({ type: 'p', text: l });
  }
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((x, j) => (
          <li key={j}>{inline(x)}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{inline(b.text)}</p>
    )
  );
}

/** Reveals the reply a few characters at a time, like someone typing. Tap to show it all. */
function Typewriter({ text, onDone }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? text.length : 0));
  const done = shown >= text.length;
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (done) {
      doneRef.current?.();
      return undefined;
    }
    // About 1.5 seconds for a typical reply, never slower than 2 characters a tick
    const step = Math.max(2, Math.ceil(text.length / 90));
    const id = setInterval(() => setShown((n) => Math.min(text.length, n + step)), 16);
    return () => clearInterval(id);
  }, [done, text]);

  // Cut at a word boundary so half-words and half-bold markers don't flicker
  let cut = text.slice(0, shown);
  if (!done) {
    const space = cut.lastIndexOf(' ');
    if (space > 0) cut = cut.slice(0, space);
    if ((cut.match(/\*\*/g) || []).length % 2) cut += '**';
  }
  return (
    <div className={`bubble__text ${done ? '' : 'is-typing'}`} onClick={() => setShown(text.length)}>
      <RichReply text={cut} />
    </div>
  );
}

const THINKING = ['thinking-1', 'thinking-2', 'thinking-3'];

/** Three bouncing dots and a status line that changes while the AI works. */
function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % THINKING.length), 1300);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="bubble bubble--ai bubble--thinking" role="status" aria-live="polite">
      <span className="dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span key={i} className="thinking__text">
        {t(THINKING[i])}
      </span>
    </div>
  );
}

let msgId = 0;

export default function Twin() {
  const { state, saveScenario, removeScenario } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  // The conversation: { id, role: 'user' | 'assistant', text, suggestions?, local?, typed? }
  const [messages, setMessages] = useState([]);
  // What is being simulated: each change with the words it came from. `ai` marks ones the AI read.
  const [items, setItems] = useState([]);
  const [unclear, setUnclear] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const [now] = useState(() => new Date());
  const hidden = !!state.settings.hideAmounts;

  const started = messages.length > 0;
  const changes = useMemo(() => items.map((x) => x.change), [items]);
  const result = useMemo(() => (changes.length ? simulate(state, changes, now) : null), [state, changes, now]);
  const aiOn = state.settings.aiHelp !== false;
  const noIncome = !(state.plans && Object.values(state.plans).some((p) => p.salary > 0));

  // Keep the newest message and the input in view
  useEffect(() => {
    if (started) endRef.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, thinking, started]);

  const say = (msg) => setMessages((cur) => [...cur, { id: ++msgId, ...msg }]);
  const markTyped = (id) => setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, typed: true } : m)));

  // The basic reader that works offline, clause by clause
  const readLocally = (v) => {
    const found = [];
    const missed = [];
    for (const part of clauses(v)) {
      const r = understand(part);
      r.changes.forEach((change) => found.push({ change, source: part }));
      missed.push(...r.unclear);
    }
    return { found, missed };
  };

  // AI first when it's on and online: it answers questions and, only for plans, returns changes.
  // Otherwise the phone answers: a basic summary for questions, the basic reader for plans.
  const run = async (value = text) => {
    const v = value.trim();
    if (!v || thinking) return;
    setText('');
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    say({ role: 'user', text: v });
    const context = buildContext(state, now);

    if (aiOn) {
      setThinking(true);
      const ai = await askAI({ text: v, context, history });
      setThinking(false);
      if (ai && (ai.reply || ai.changes.length)) {
        if (ai.changes.length) setItems((cur) => [...cur, ...ai.changes.map((change) => ({ change, source: v, ai: true }))]);
        setUnclear(ai.unclear.map((u) => ({ text: u, hint: null })));
        say({ role: 'assistant', text: ai.reply || t('reply-set-up'), suggestions: ai.suggestions });
        return;
      }
    }

    const local = readLocally(v);
    if (local.found.length) {
      setItems((cur) => [...cur, ...local.found]);
      setUnclear(local.missed);
      say({ role: 'assistant', text: t('reply-local-scenario'), local: aiOn });
    } else if (local.missed.some((u) => u.hint != null)) {
      setUnclear(local.missed);
      say({ role: 'assistant', text: t('reply-need-price'), local: aiOn });
    } else if (looksLikeQuestion(v)) {
      const a = localAnswer(context);
      setUnclear([]);
      say({ role: 'assistant', text: a.text, suggestions: a.suggestions, local: true });
    } else {
      setUnclear([]);
      say({ role: 'assistant', text: t('reply-not-understood'), suggestions: [t('ex-analyze'), t('ex-goal')], local: aiOn });
    }
  };

  const removeChange = (i) => setItems((cur) => cur.filter((_, j) => j !== i));
  const setAmount = (i, amount) =>
    setItems((cur) => cur.map((x, j) => (j === i ? { ...x, change: { ...x.change, amount, estimated: false } } : x)));
  // Price given for something the reader asked about: read the sentence again with the price added
  const answerPrice = (u, price) => {
    setUnclear((cur) => cur.filter((x) => x !== u));
    run(`${u.text} ${price}`);
  };
  const reset = () => {
    setItems([]);
    setUnclear([]);
    setMessages([]);
  };

  const listen = () => {
    if (!Speech) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Speech();
    rec.lang = getConfig().lang === 'id' ? 'id-ID' : 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      const said = [...e.results].map((r) => r[0].transcript).join(' ');
      setText(said);
      if (e.results[e.results.length - 1].isFinal) run(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      toast(t('Couldn’t hear that. Check the microphone permission, or type instead.'), { tone: 'warn' });
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const save = () => {
    const sentence = [...new Set(items.map((x) => x.source))].join(', ');
    const name = window.prompt(t('Name this scenario'), changes[0] ? describe(changes[0]) : '');
    if (name == null) return;
    saveScenario({ name: name || sentence.slice(0, 40), text: sentence, items });
    toast(t('Scenario saved. Your real data is unchanged.'));
  };

  const last = messages[messages.length - 1];

  return (
    <div className={`page twin ${hidden ? 'is-private' : ''}`}>
      <header className="page__head twin__head">
        <Link to="/" className="icon-btn" aria-label={t('Back to home')}>
          <ChevronLeft size={22} />
        </Link>
        <h1>{t('Ask Spendify')}</h1>
        {started && (
          <button className="link-btn twin__new" onClick={reset}>
            {t('New chat')}
          </button>
        )}
      </header>

      {noIncome ? (
        <div className="empty">
          <p className="empty__title">{t('Set your monthly income first')}</p>
          <p>
            <Link to="/settings" className="link-btn">
              {t('Open Settings')}
            </Link>
          </p>
        </div>
      ) : (
        <>
          {!started && (
            <div className="twin__hello">
              <span className="twin__orb" aria-hidden="true">
                <Sparkles size={26} />
              </span>
              <p className="twin__intro">{t('twin-intro')}</p>
            </div>
          )}

          {started && (
            <div className="thread" aria-live="polite">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="bubble bubble--me">
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="bubble bubble--ai private-num">
                    <span className="bubble__who" aria-hidden="true">
                      <Sparkles size={14} />
                    </span>
                    <Typewriter text={m.text} onDone={() => !m.typed && markTyped(m.id)} />
                    {m.local && <span className="bubble__tag">{t('Answered on this phone (AI not available)')}</span>}
                  </div>
                )
              )}
              {thinking && <Thinking />}
            </div>
          )}

          {/* The simulator's cards appear only when a reply set up a plan or a "what if" */}
          {items.length > 0 && (
            <section className="section scenario" aria-labelledby="changes-title">
              <div className="section__head">
                <h2 id="changes-title">{t('Your scenario')}</h2>
              </div>
              <ul className="changes">
                {items.map(({ change: c, ai }, i) => (
                  <li key={i} className="change">
                    <span className="change__text private-num">
                      {describe(c)}
                      {ai && (
                        <span className="change__ai" title={t('Understood with AI')}>
                          <Sparkles size={13} aria-label={t('Understood with AI')} />
                        </span>
                      )}
                    </span>
                    <button className="icon-btn icon-btn--sm" onClick={() => removeChange(i)} aria-label={t('Remove')}>
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {unclear.map((u, i) => (u.hint != null ? <PriceAsk key={i} name={u.hint} onAnswer={(price) => answerPrice(u, price)} /> : null))}
          {result && <Results r={result} onSave={save} onAmount={setAmount} />}

          {last?.role === 'assistant' && last.typed && last.suggestions?.length > 0 && !thinking && (
            <div className="followups" role="group" aria-label={t('Ideas')}>
              {last.suggestions.map((s) => (
                <button key={s} type="button" className="chip chip--suggest" onClick={() => run(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            className="ask"
            ref={endRef}
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={listening ? t('Listening…') : started ? t('Ask a follow-up…') : t('ask-placeholder')}
              aria-label={t('What do you want to know?')}
              enterKeyHint="send"
              disabled={thinking}
            />
            {Speech && (
              <button type="button" className={`icon-btn ask__mic ${listening ? 'is-on' : ''}`} onClick={listen} aria-label={listening ? t('Stop listening') : t('Speak')}>
                {listening ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            <button type="submit" className="ask__send" disabled={!text.trim() || thinking} aria-label={t('Send')}>
              <ArrowUp size={20} strokeWidth={2.5} />
            </button>
          </form>
          <p className="twin__ai-note">{aiOn ? t('ai-note') : t('ai-off-note')}</p>

          {!started && (
            <div className="twin__examples" role="group" aria-label={t('Ideas')}>
              {EXAMPLES.map((k) => (
                <button key={k} type="button" className="chip" onClick={() => run(t(k))}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}

          {state.scenarios.length > 0 && !started && (
            <section className="section" aria-labelledby="saved-title">
              <div className="section__head">
                <h2 id="saved-title">{t('Saved scenarios')}</h2>
              </div>
              <ul className="saved">
                {state.scenarios.map((s) => (
                  <li key={s.id}>
                    <button
                      className="saved__open"
                      onClick={() => {
                        const kept = (s.items || []).map((x) => ({ ...x, change: cleanChange(x.change) })).filter((x) => x.change);
                        if (kept.length) {
                          setItems(kept);
                          setUnclear([]);
                          say({ role: 'assistant', text: t('reply-opened', { name: s.name }), typed: true });
                        } else run(s.text);
                      }}
                    >
                      <Bookmark size={16} aria-hidden="true" />
                      <span>
                        <strong>{s.name}</strong>
                        <span className="saved__text">{s.text}</span>
                      </span>
                    </button>
                    <button className="icon-btn icon-btn--sm" onClick={() => removeScenario(s.id)} aria-label={t('Delete')}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="twin__foot">{t('This is only a simulation. Your real expenses and savings are never changed.')}</p>
        </>
      )}
    </div>
  );
}

/** "How much is the iQOO?" with a price box, instead of making her retype the sentence. */
function PriceAsk({ name, onAnswer }) {
  const [price, setPrice] = useState('');
  const value = parseAmountInput(price);
  return (
    <form
      className="price-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (value > 0) onAnswer(String(value));
      }}
    >
      <label className="price-ask__q" htmlFor="price-ask">
        {name ? t('How much is {name}?', { name }) : t('How much is it?')}
      </label>
      <div className="price-ask__row">
        <div className="input-prefix">
          <span aria-hidden="true">{currencySymbol()}</span>
          <input id="price-ask" inputMode="numeric" value={price} onChange={(e) => setPrice(formatAmountInput(e.target.value))} placeholder="3.000.000" autoFocus />
        </div>
        <button type="submit" className="btn btn--primary" disabled={!(value > 0)}>
          {t('Next')}
        </button>
      </div>
    </form>
  );
}

function Results({ r, onSave, onAmount }) {
  const label = (k) => (k == null ? t('not within a year') : k === 0 ? t('this month') : monthLabel(addMonths(r.base.key, k), { month: 'short', year: 'numeric' }));
  const shift = (before, after) => {
    if (before === after) return null;
    if (after == null) return { tone: 'bad', text: t('much later') };
    if (before == null) return { tone: 'good', text: t('within a year') };
    const d = after - before;
    return d > 0 ? { tone: 'bad', text: tn(d, '{n} month later', '{n} months later') } : { tone: 'good', text: tn(-d, '{n} month sooner', '{n} months sooner') };
  };

  let verdict;
  if (r.afford) {
    if (!r.afford.ok)
      verdict = {
        tone: 'bad',
        title: t('Not yet affordable'),
        text:
          t('You would be {amount} short.', { amount: money(-r.afford.lowest) }) +
          ' ' +
          (r.afford.waitUntil != null ? t('If you wait, you could afford it around {month}.', { month: label(r.afford.waitUntil) }) : t('It would take more than a year at your current pace.')),
      };
    else if (r.afford.thin)
      verdict = {
        tone: 'warn',
        title: t('Yes, but it’s tight'),
        text: t('afford-thin', { amount: money(r.afford.lowest), cushion: money(r.afford.cushion) }),
      };
    else verdict = { tone: 'good', title: t('Yes, you can'), text: t('afford-ok', { amount: money(r.afford.lowest) }) };
  } else {
    const d = r.after.balance[12] - r.before.balance[12];
    verdict = {
      tone: d >= 0 ? 'good' : 'warn',
      title: d >= 0 ? t('{amount} more in a year', { amount: money(d) }) : t('{amount} less in a year', { amount: money(-d) }),
      text: t('In 12 months you would have about {amount} saved.', { amount: money(r.after.balance[12]) }),
    };
  }

  const rows = [
    [t('Saved per month'), r.before.monthlyNet, r.after.monthlyNet],
    [t('Left this month'), r.thisMonthLeft.before, r.thisMonthLeft.after],
    [t('Savings in 3 months'), r.before.balance[3], r.after.balance[3]],
    [t('Savings in 6 months'), r.before.balance[6], r.after.balance[6]],
    [t('Savings in 12 months'), r.before.balance[12], r.after.balance[12]],
  ];

  // A scenario that is only "save up for X" doesn't change spending, so the plan card is the whole answer.
  const onlyPlans = r.plans.length > 0 && !r.afford && !r.targets.length && r.after.balance.every((b, i) => b === r.before.balance[i]);

  return (
    <>
      {r.plans.map((plan) => (
        <PlanCard key={`${plan.index}-${plan.name}`} plan={plan} onAmount={(v) => onAmount(plan.index, v)} />
      ))}
      {onlyPlans ? null : (
        <>
      <section className={`verdict is-${verdict.tone}`} aria-live="polite">
        <h2 className="verdict__title">{verdict.title}</h2>
        <p className="verdict__text private-num">{verdict.text}</p>
      </section>

      <section className="card twin__card" aria-labelledby="compare-title">
        <h2 id="compare-title" className="sr-only">
          {t('Before and after')}
        </h2>
        <table className="compare">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">{t('Now')}</th>
              <th scope="col">{t('With this')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, a, b]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td className="private-num">{signed(a)}</td>
                <td className={`private-num ${b > a ? 'is-good' : b < a ? 'is-bad' : ''}`}>{signed(b)}</td>
              </tr>
            ))}
            {r.goals.map((g) => {
              const s = shift(g.before, g.after);
              return (
                <tr key={g.id}>
                  <th scope="row">{t('Goal: {name}', { name: g.name })}</th>
                  <td>{label(g.before)}</td>
                  <td className={s ? `is-${s.tone}` : ''}>
                    {label(g.after)}
                    {s && <span className="compare__note">{s.text}</span>}
                  </td>
                </tr>
              );
            })}
            {r.targets.map((x) => {
              const s = shift(x.before, x.after);
              return (
                <tr key={x.amount}>
                  <th scope="row" className="private-num">
                    {t('Savings reach {amount}', { amount: money(x.amount) })}
                  </th>
                  <td>{label(x.before)}</td>
                  <td className={s ? `is-${s.tone}` : ''}>
                    {label(x.after)}
                    {s && <span className="compare__note">{s.text}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <TwinChart r={r} label={label} />
      </section>

      <button className="btn btn--ghost btn--block" onClick={onSave}>
        <Bookmark size={18} /> {t('Save this scenario')}
      </button>
        </>
      )}
    </>
  );
}

/** A savings plan, and the question: add it as a savings goal? */
function PlanCard({ plan, onAmount }) {
  const { state, addGoal } = useStore();
  const toast = useToast();
  const [pace, setPace] = useState('main'); // or 'easier'
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(() => amountToInput(plan.amount));
  const chosen = pace === 'easier' && plan.easier ? { ...plan, ...plan.easier, level: 'easy' } : plan;
  const name = plan.name || t('My goal');
  const added = state.goals.some((g) => g.name === name && g.target === plan.amount);
  const month = (key) => monthLabel(key, { month: 'long', year: 'numeric' });

  const lines = [];
  if (chosen.level === 'covered') {
    lines.push(t('plan-covered', { amount: money(plan.amount) }));
  } else {
    lines.push(
      t('plan-need', {
        amount: money(chosen.need),
        n: chosen.months,
        month: month(chosen.by),
      }) + (plan.need < plan.amount ? ` ${t('plan-spare', { amount: money(plan.amount - plan.need) })}` : '')
    );
    lines.push(t('plan-monthly', { amount: money(roundUpNice(chosen.monthly)) }));
    if (chosen.proposed && pace === 'main') lines.push(t('plan-proposed'));
    lines.push(
      chosen.level === 'easy'
        ? t('plan-easy', { free: money(chosen.free) })
        : chosen.level === 'tight'
          ? t('plan-tight', { free: money(chosen.free) })
          : t('plan-hard', { free: money(chosen.free) })
    );
  }

  const add = () => {
    addGoal({ name, target: plan.amount, by: chosen.level === 'covered' ? null : chosen.by });
    toast(t('Goal added: {name}. You can see it on Home.', { name }));
  };

  return (
    <section className={`plan is-${chosen.level}`} aria-label={t('Savings plan for {name}', { name })}>
      <div className="plan__head">
        <span className="plan__icon" aria-hidden="true">
          <PiggyBank size={20} />
        </span>
        <h2 className="plan__title">{t('Plan: {name}', { name })}</h2>
      </div>
      {plan.estimated && !editing && (
        <p className="plan__estimate">
          {t('AI estimated the price at about {amount}.', { amount: money(plan.amount) })}{' '}
          <button type="button" className="link-btn" onClick={() => setEditing(true)}>
            {t('Change price')}
          </button>
        </p>
      )}
      {editing && (
        <form
          className="price-ask__row"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseAmountInput(price);
            if (v > 0) {
              onAmount(v);
              setEditing(false);
            }
          }}
        >
          <div className="input-prefix">
            <span aria-hidden="true">{currencySymbol()}</span>
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(formatAmountInput(e.target.value))} aria-label={t('Price')} autoFocus />
          </div>
          <button type="submit" className="btn btn--primary">
            {t('Save price')}
          </button>
        </form>
      )}
      {lines.map((l, i) => (
        <p key={i} className={`plan__line private-num ${i === lines.length - 1 && chosen.level !== 'covered' ? 'plan__verdict' : ''}`}>
          {l}
        </p>
      ))}
      {plan.easier && plan.level === 'hard' && (
        <button type="button" className="chip plan__alt" onClick={() => setPace(pace === 'easier' ? 'main' : 'easier')}>
          {pace === 'easier'
            ? t('Back to {n} months', { n: plan.months })
            : t('Try {n} months instead ({amount} a month)', { n: plan.easier.months, amount: money(roundUpNice(plan.easier.monthly)) })}
        </button>
      )}
      {added ? (
        <p className="plan__done">
          <Check size={16} aria-hidden="true" /> {t('Added to your savings goals')}{' '}
          <Link to="/" className="link-btn">
            {t('See on Home')}
          </Link>
        </p>
      ) : (
        <div className="plan__ask">
          <p className="plan__q">{t('Add this to your savings goals?')}</p>
          <button type="button" className="btn btn--primary" onClick={add}>
            {t('Yes, add it')}
          </button>
        </div>
      )}
    </section>
  );
}

function TwinChart({ r, label }) {
  const W = 340;
  const H = 150;
  const pad = { t: 12, r: 10, b: 22, l: 10 };
  const all = [...r.before.balance, ...r.after.balance];
  const max = Math.max(...all, 1);
  const min = Math.min(0, ...all);
  const x = (k) => pad.l + (k / 12) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
  const path = (arr) => arr.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <figure className="twin__chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Savings over the next 12 months, now and with this scenario')}>
        {min < 0 && <line className="pc__cap" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />}
        <path className="pc__prev" d={path(r.before.balance)} />
        <path className="pc__now" d={path(r.after.balance)} />
        <circle className="pc__dot" cx={x(12)} cy={y(r.after.balance[12])} r={4} />
        <text className="pc__label private-num" x={x(12)} y={y(r.after.balance[12]) - 8} textAnchor="end">
          {compact(r.after.balance[12])}
        </text>
        {[0, 3, 6, 12].map((k) => (
          <text key={k} className="pc__tick" x={x(k)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 12 ? 'end' : 'middle'}>
            {k === 0 ? t('Now') : label(k)}
          </text>
        ))}
      </svg>
      <figcaption className="pace__legend">
        <span>
          <span className="swatch swatch--prev" /> {t('As things are')}
        </span>
        <span>
          <span className="swatch swatch--now" /> {t('With this')}
        </span>
      </figcaption>
    </figure>
  );
}
