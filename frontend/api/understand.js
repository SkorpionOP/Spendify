/*
 * Vercel serverless function: turns one "what if" sentence into structured changes using Groq.
 *
 * The API key lives only in the Vercel environment variable GROQ_API_KEY, never in the app.
 * The app sends just the sentence and currency code (no expenses, balances or names). The simulation
 * itself still runs on the phone; this only reads the sentence.
 */
import { CATEGORIES } from '../src/lib/categories.js';
import { cleanChanges } from '../src/lib/changes.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_CHARS = 300;

const nullable = (type) => ({ type: [type, 'null'] });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['changes', 'unclear'],
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'name', 'at', 'category', 'pct', 'delta', 'set', 'months', 'estimated'],
        properties: {
          type: { type: 'string', enum: ['purchase', 'save', 'cut', 'income', 'monthly', 'target', 'goal'] },
          amount: nullable('number'),
          name: nullable('string'),
          at: nullable('integer'),
          category: { type: ['string', 'null'], enum: [...CATEGORIES.map((c) => c.name), null] },
          pct: nullable('number'),
          delta: nullable('number'),
          set: nullable('number'),
          months: nullable('integer'),
          estimated: nullable('boolean'),
        },
      },
    },
    unclear: { type: 'array', items: { type: 'string' } },
  },
};

const instructions = (currency, month) => `You read short "what if" money plans written by a person in Indonesian or English (often casual, with slang like "rb", "jt", "gopek", "ceban", "sejuta") and convert them into changes for a personal budget simulator. Currency: ${currency}. The current month is ${month}.

Return only changes the person actually described. Fill fields that don't apply with null. Change types:
- purchase: one-off spending. amount, name (what it is, in the person's language, capitalised, without the price or timing, e.g. "Liburan ke Jepang", "iPhone 15", "Motor"), at = months from now (0 = this month, 1 = next month; "akhir tahun"/"end of the year" = December, "tahun depan"/"next year" = next January).
- save: put this much MORE into savings every month (spend less). amount per month.
- cut: spend less on one category every month. category (one of the allowed values), and either pct (fraction, 0.15 = 15%, 1 = stop completely) or amount per month. A daily habit like "ngopi 25rb tiap hari" stopped completely is pct 1.
- income: monthly income change. Exactly one of: pct (fraction, negative for a decrease), delta (amount, negative for a decrease), set (the new total income).
- monthly: a new recurring monthly cost such as an instalment, subscription or rent. amount per month (convert daily costs to monthly by multiplying by 30), name, months (null if ongoing).
- target: the person asks when their savings will reach an amount. amount.
- goal: the person wants to save up for something specific ("nabung buat liburan 5 juta", "I want to save 3M for a phone by June", "mau punya dana darurat 10 juta"). amount (total needed), name (what it's for, capitalised), months = months from now until they want it (null if they didn't say). A purchase in the future that the person is planning towards can also be a purchase with at > 0.

Prices: if the person names a specific thing to buy or save for (a phone model, a laptop, a trip to a place, a concert) but gives no price, estimate a typical current price for it in ${currency} (Indonesian market for IDR), round it, and set estimated to true. Questions like "how should I save", "gimana nabungnya", "what's the plan" with a timeframe mean a goal with months. Only put things in "unclear" when they are too vague to price ("something", "stuff") or not about money. For amounts the person gave, set estimated to false.

Amounts are plain numbers in full units: "1,5 jt" = 1500000, "200rb" = 200000, "gopek" = 500, "goceng" = 5000, "ceban" = 10000, "cepek" = 100, "sejuta" = 1000000, "10M" = 10000000.
If part of the text is too vague to price or is not about money, copy that part into "unclear".`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'not-configured' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const text = String(body.text || '').trim().slice(0, MAX_CHARS);
  const currency = /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'IDR';
  if (!text) return res.status(400).json({ error: 'empty' });
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: instructions(currency, month) },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'changes', strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const out = safeJson(data?.choices?.[0]?.message?.content || '{}') || {};
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      changes: cleanChanges(out.changes),
      unclear: Array.isArray(out.unclear) ? out.unclear.filter((u) => typeof u === 'string').slice(0, 5).map((u) => u.slice(0, 120)) : [],
    });
  } catch {
    return res.status(502).json({ error: 'failed' });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
