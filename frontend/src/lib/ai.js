import { cleanChanges } from './changes.js';
import { getConfig } from './i18n';

/*
 * Asks the app's own server function (/api/understand), which asks Groq, to read a "what if" sentence.
 * Only the sentence and currency code are sent. Returns null when AI isn't available (offline,
 * not set up, rate-limited, slow), so the caller can fall back to the on-device reader.
 */
export const askAI = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const r = await fetch('/api/understand', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 300), currency: getConfig().currency }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { changes: cleanChanges(j.changes), unclear: Array.isArray(j.unclear) ? j.unclear.filter((u) => typeof u === 'string') : [] };
  } catch {
    return null;
  }
};
