import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { askRecap } from '../lib/ai';
import { recapContext } from '../lib/aicontext';
import { getConfig, t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { RichReply } from './RichReply';

/*
 * A few AI-written lines under the week or month recap on Home: how it went and what to try next.
 * Asked once per period (and language) and kept on this phone, so it costs one AI call a week or month.
 * Only totals are sent (see recapContext). Shows nothing when AI help is off, offline, or it fails.
 */

const CACHE = 'spendify:ai-recaps';

const readCache = (key) => {
  try {
    return JSON.parse(localStorage.getItem(CACHE) || '{}')[key] || null;
  } catch {
    return null;
  }
};

const writeCache = (key, text) => {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
    all[key] = text;
    // Keep the newest few
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete all[k];
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch {
    /* storage full or blocked: it will just be asked again next time */
  }
};

/** period: { from, to, prevFrom, prevTo, month? } as ISO dates (month as YYYY-MM). */
export function AiRecap({ kind, period }) {
  const { state } = useStore();
  const aiOn = state.settings.aiHelp !== false;
  const cacheKey = `${kind}:${period.from}:${getConfig().lang}`;
  const [text, setText] = useState(() => readCache(cacheKey));
  const stateRef = useRef(state);
  const asked = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    if (!aiOn || text || asked.current === cacheKey) return;
    asked.current = cacheKey;
    const context = recapContext(stateRef.current, { kind, ...period });
    askRecap({ context }).then((reply) => {
      if (!reply) return;
      writeCache(cacheKey, reply);
      setText(reply);
    });
  }, [aiOn, text, cacheKey, kind, period]);

  if (!aiOn || !text) return null;
  return (
    <div className="nudge__ai">
      <span className="nudge__ai-tag">
        <Sparkles size={13} aria-hidden="true" /> {t('AI recap')}
      </span>
      <div className="nudge__ai-text private-num">
        <RichReply text={text} />
      </div>
      <Link to="/twin" className="link-btn">
        {t('Ask about it')}
      </Link>
    </div>
  );
}
