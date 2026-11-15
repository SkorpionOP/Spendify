import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { pickCheer } from '../lib/cheers';
import { money } from '../lib/format';
import { t } from '../lib/i18n';

const SEEN_KEY = 'spendify:cheers';
const readSeen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const writeSeen = (set) => {
  try {
    // Keep the list short; old keys belong to finished months and goals.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-200)));
  } catch {
    /* private mode: it may show again next time */
  }
};

const TEXT = {
  'goal-done': { emoji: '🎉', title: 'cheer-done-title', body: 'cheer-done-body' },
  'goal-90': { emoji: '🔥', title: 'cheer-90-title', body: 'cheer-90-body' },
  'goal-75': { emoji: '💪', title: 'cheer-75-title', body: 'cheer-75-body' },
  'goal-50': { emoji: '✨', title: 'cheer-50-title', body: 'cheer-50-body' },
  payday: { emoji: '💰', title: 'cheer-payday-title', body: 'cheer-payday-body' },
  pace: { emoji: '📉', title: 'cheer-pace-title', body: 'cheer-pace-body' },
};

/** One small celebration at the top of Home. Shown until she closes it, then never again. */
export function CheerCard() {
  const { state } = useStore();
  const [seen, setSeen] = useState(readSeen);
  const [now] = useState(() => new Date());
  const cheer = pickCheer(state, now, seen);
  if (!cheer) return null;

  const text = TEXT[cheer.type];
  const vars = {
    name: cheer.name,
    saved: money(cheer.saved),
    target: money(cheer.target),
    missing: money(cheer.missing),
    left: money(cheer.left),
    pct: cheer.pct,
  };
  const close = () => {
    const next = new Set([...seen, ...cheer.covers]);
    writeSeen(next);
    setSeen(next);
  };

  return (
    <section className={`nudge nudge--cheer ${cheer.type === 'goal-done' ? 'is-party' : ''}`} aria-live="polite" aria-labelledby="cheer-title">
      <button className="icon-btn icon-btn--sm nudge__close" onClick={close} aria-label={t('Got it')}>
        <X size={16} />
      </button>
      <span className="cheer__emoji" aria-hidden="true">
        {text.emoji}
      </span>
      <div>
        <h2 id="cheer-title" className="nudge__title">
          {t(text.title, vars)}
        </h2>
        <p className="nudge__body private-num">{t(text.body, vars)}</p>
      </div>
    </section>
  );
}
