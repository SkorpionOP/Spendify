/*
 * Vercel serverless function: Spendify's money assistant, backed by Groq.
 *
 * The API key lives only in the Vercel environment variable GROQ_API_KEY, never in the app.
 * The app sends the question, the last few messages, and a summary of her numbers (totals per
 * category, income, savings, limits, goals). Never individual expenses, notes or her name.
 * The reply is plain text; `changes` is filled only when she describes a plan or a "what if",
 * and the simulation of those changes runs on the phone.
 */
import { CATEGORIES } from '../src/lib/categories.js';
import { cleanChanges } from '../src/lib/changes.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_CHARS = 400;

const nullable = (type) => ({ type: [type, 'null'] });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'changes', 'unclear', 'suggestions'],
  properties: {
    reply: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'amount', 'name', 'at', 'category', 'pct', 'delta', 'set', 'months', 'estimated'],
        properties: {
          type: { type: 'string', enum: ['purchase', 'save', 'cut', 'income', 'monthly', 'target', 'goal', 'limit'] },
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
    suggestions: { type: 'array', items: { type: 'string' } },
  },
};

const instructions = ({ lang, currency, month, context }) => `You are Spendify's money assistant inside a personal budgeting app. Reply in the language the person writes in (the app is set to ${
  lang === 'id' ? 'Bahasa Indonesia' : 'English'
}). In Indonesian, be casual and warm and use "kamu"; in English, friendly and plain. The reply and the suggestions must be in the same language. Currency: ${currency}. Current month: ${month}.

Their money, as a summary (all amounts in whole ${currency}; categories use the app's English keys):
${JSON.stringify(context)}

How to answer:
- Answer the actual question. Use their real numbers from the summary; never invent figures, limits or goals that aren't there. If the summary lacks something, say so briefly.
- Read the field names carefully: spending is not savings. For "more/less than last month", use changeVsLastMonthBySameDay (positive = spending more). Mid-month, compare with last month by the same day, not with all of last month.
- Be specific and practical: name categories (translate category keys into the reply language), give amounts, compare with last month or their usual month, and suggest 1-3 concrete actions they control.
- Keep it short: at most about 110 words. Use short paragraphs or "- " bullet lines. You may bold a key number with **...**. No headings, no tables, at most one emoji.
- Format money like ${currency === 'IDR' ? '"Rp 1.250.000"' : 'the usual local format'}, rounded to a friendly amount (e.g. Rp 917.000, not Rp 916.667).
- You are not a licensed financial adviser; don't recommend specific investment products.

Changes (the "what if" simulator): ONLY when the person describes a plan, decision or hypothetical (buying something, saving for something, cutting a category, an income change, a new monthly cost, asking when savings reach an amount), also return it in "changes" so the app can simulate it. For questions, analysis or advice, return an empty "changes" array. Change types:
- purchase: one-off spending. amount, name (what it is, capitalised, without price or timing), at = months from now (0 = this month; "akhir tahun" = December; "tahun depan" = next January).
- save: put this much MORE into savings every month. amount per month.
- cut: spend less on one category every month. category (allowed values only), and either pct (fraction; 1 = stop completely) or amount per month.
- income: monthly income change. Exactly one of pct (fraction, negative for a decrease), delta (negative for a decrease), set (new total).
- monthly: a new recurring monthly cost (instalment, subscription, rent). amount per month (daily cost x 30), name, months (null if ongoing).
- target: when will savings reach an amount. amount.
- goal: saving up for something specific. amount (total), name, months until they want it (null if not said).
- limit: set (or change) a monthly spending limit for one category in the app, e.g. "batasi jajan 500rb sebulan", "set a food limit". category (allowed values only), amount = the monthly cap. To remove a limit, amount null. If they ask you to suggest limits without amounts, propose one limit per category worth limiting (at most 4), based on their usual spending and current limits, rounded to friendly amounts. Limits are real settings: the app shows a button so they can confirm each one, so say they can tap to set it; never claim it is already set.
For a goal or a future purchase, return just that one change: don't add a separate "save" change for the monthly amount, the app works that out and shows it.
If they name a specific thing but no price, estimate a typical current price (Indonesian market for IDR), round it, and set estimated to true; otherwise estimated is false. Amounts are full numbers: "1,5 jt" = 1500000, "200rb" = 200000, "gopek" = 500, "goceng" = 5000, "ceban" = 10000, "sejuta" = 1000000. Fill fields that don't apply with null. When you return changes, the reply should briefly say what you set up (the app shows the numbers).
- "unclear": parts of a plan that are too vague to simulate. Usually empty.
- "suggestions": 2 or 3 short follow-up things the person might tap next, written as the person would say them, in the reply language, each under 45 characters.`;

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'not-configured' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const text = String(body.text || '').trim().slice(0, MAX_CHARS);
  if (!text) return res.status(400).json({ error: 'empty' });
  const currency = /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'IDR';
  const lang = body.lang === 'en' ? 'en' : 'id';
  const context = body.context && typeof body.context === 'object' && JSON.stringify(body.context).length <= 8000 ? body.context : {};
  // A few earlier turns, so follow-ups like "and coffee?" make sense
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, content: m.text.slice(0, 600) }));
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_completion_tokens: 1500,
        reasoning_effort: 'medium',
        messages: [{ role: 'system', content: instructions({ lang, currency, month, context }) }, ...history, { role: 'user', content: text }],
        response_format: { type: 'json_schema', json_schema: { name: 'assistant_reply', strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const out = safeJson(data?.choices?.[0]?.message?.content || '{}') || {};
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      reply: cleanText(out.reply, 1500),
      changes: cleanChanges(out.changes),
      unclear: Array.isArray(out.unclear) ? out.unclear.filter((u) => typeof u === 'string').slice(0, 5).map((u) => u.slice(0, 120)) : [],
      suggestions: Array.isArray(out.suggestions) ? out.suggestions.map((s) => cleanText(s, 60)).filter(Boolean).slice(0, 3) : [],
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
