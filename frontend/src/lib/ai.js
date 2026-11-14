import { cleanChanges } from './changes.js';
import { getConfig } from './i18n';

/*
 * Asks the app's own server function (/api/understand), which asks Groq. Sends the question, the
 * last few messages, and the totals-only summary from buildContext(). Returns null when AI isn't
 * available (offline, not set up, rate-limited, slow), so the caller can fall back.
 */
export const askAI = async ({ text, context, history = [] }) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const r = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: String(text).slice(0, 400),
        currency: getConfig().currency,
        lang: getConfig().lang,
        context,
        history: history.slice(-6).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 600) })),
      }),
      signal: AbortSignal.timeout(16000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      reply: typeof j.reply === 'string' ? j.reply : '',
      changes: cleanChanges(j.changes),
      unclear: Array.isArray(j.unclear) ? j.unclear.filter((u) => typeof u === 'string') : [],
      suggestions: Array.isArray(j.suggestions) ? j.suggestions.filter((u) => typeof u === 'string').slice(0, 3) : [],
    };
  } catch {
    return null;
  }
};
