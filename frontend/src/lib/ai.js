import { cleanChanges } from './changes.js';
import { getConfig } from './i18n';

/*
 * Asks the app's own server function (/api/understand), which asks Groq. Sends the question, the
 * last few messages, and the totals-only summary from buildContext(). Never individual expenses.
 *
 * askAI streams: onDelta(textSoFar) is called as the reply is written. It resolves to
 *   { reply, changes, unclear, suggestions, dataOk }   the answer
 *   { limited: true, retryAfter }                       too many questions for now (rate limit)
 *   null                                                AI not available (offline, not set up, slow…)
 * so the caller can fall back to the phone's own reader.
 */

const MAX_TEXT = 1000;

const tidy = (j, dataOk = true) => ({
  reply: typeof j.reply === 'string' ? j.reply : '',
  changes: cleanChanges(j.changes),
  unclear: Array.isArray(j.unclear) ? j.unclear.filter((u) => typeof u === 'string') : [],
  suggestions: Array.isArray(j.suggestions) ? j.suggestions.filter((u) => typeof u === 'string').slice(0, 3) : [],
  dataOk,
});

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const limitedFrom = async (r) => {
  let retryAfter = Number(r.headers?.get?.('retry-after')) || null;
  try {
    retryAfter = (await r.json())?.retryAfter || retryAfter;
  } catch {
    /* no body */
  }
  return { limited: true, retryAfter };
};

/** Reads NDJSON lines from a streamed response. */
async function readStream(r, onDelta) {
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let done = null;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !end });
    const lines = buf.split('\n');
    buf = end ? '' : lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.t === 'delta' && typeof msg.text === 'string') {
        text += msg.text;
        onDelta?.(text);
      } else if (msg.t === 'done') done = msg;
      else if (msg.t === 'error') return null;
    }
    if (end) break;
  }
  return done ? tidy(done, done.dataOk !== false) : null;
}

export const askAI = async ({ text, context, history = [], onDelta = null, timeout = 30000 }) => {
  if (offline()) return null;
  try {
    const r = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: String(text).slice(0, MAX_TEXT),
        currency: getConfig().currency,
        lang: getConfig().lang,
        context,
        history: history.slice(-6).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 600) })),
        stream: true,
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (r.status === 429) return limitedFrom(r);
    if (!r.ok) return null;
    const type = r.headers?.get?.('content-type') || '';
    if (type.includes('ndjson') && r.body?.getReader) return await readStream(r, onDelta);
    // A server that answered all at once
    return tidy(await r.json());
  } catch {
    return null;
  }
};

/** A short AI-written recap of a finished week or month, from recapContext(). Null when unavailable. */
export const askRecap = async ({ context }) => {
  if (offline()) return null;
  try {
    const r = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'recap', currency: getConfig().currency, lang: getConfig().lang, context }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j.reply === 'string' && j.reply.trim() ? j.reply.trim() : null;
  } catch {
    return null;
  }
};

/**
 * Reads a receipt or payment screenshot (a JPEG data URL from lib/image.js) with the AI.
 * Resolves to { receipt } (see lib/receipt.js), { limited: true }, or null when unavailable.
 */
export const scanReceipt = async ({ image, today }) => {
  if (offline()) return null;
  try {
    const r = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'receipt', image, today, currency: getConfig().currency, lang: getConfig().lang }),
      signal: AbortSignal.timeout(40000),
    });
    if (r.status === 429) return limitedFrom(r);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.receipt ? { receipt: j.receipt } : null;
  } catch {
    return null;
  }
};
