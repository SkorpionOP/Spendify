/*
 * Vercel serverless function: Spendify's money assistant, backed by Groq.
 *
 * The API key lives only in the Vercel environment variable GROQ_API_KEY, never in the app.
 * The app sends the question, the last few messages, and a summary of her numbers (totals per
 * category, income, savings, limits, goals). Never individual expenses, notes or her name.
 *
 * Modes (body.mode):
 * - "chat" (default): answers a question. `changes` is filled when she describes a plan or a "what if"
 *   (simulated on the phone), wants to log/change/delete an expense, or asks about specific expenses.
 *   Expenses are searched on the phone: the AI only describes what to look for.
 *   With body.stream = true the reply streams as NDJSON lines: {t:"delta",text} … {t:"done",…}.
 *   Groq can't stream with strict JSON output, so the streamed reply is written as plain text, then a
 *   marker line, then the JSON data; the data still goes through cleanChanges before it is used.
 *   Without stream, one strict-JSON call returns everything at once.
 * - "recap": a short written recap of a finished week or month, from that period's totals.
 * - "receipt": reads a photo of a receipt or a payment screenshot (body.image, a JPEG data URL shrunk
 *   on the phone) with a vision model and returns the total, place, date, category and items.
 *   The photo is sent only when she taps Scan, and only with AI help on.
 *
 * Every request is checked against the site's origin and a per-visitor rate limit (api/_ratelimit.js).
 */
import { CATEGORIES } from '../src/lib/categories.js';
import { cleanChanges } from '../src/lib/changes.js';
import { cleanReceipt, PAYMENT_IDS } from '../src/lib/receipt.js';
import { checkRate, originAllowed } from './_ratelimit.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// Groq's vision models are in preview and change; override with GROQ_VISION_MODEL when needed
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';
export const MAX_IMAGE_CHARS = 4_000_000; // data URL; Vercel's request limit is 4.5 MB
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const MAX_CHARS = 1000;
export const MARKER = '<<<DATA>>>';
const CATEGORY_KEYS = CATEGORIES.map((c) => c.name);

const nullable = (type) => ({ type: [type, 'null'] });
const categoryField = { type: ['string', 'null'], enum: [...CATEGORY_KEYS, null] };
const CHANGE_FIELDS = {
  type: { type: 'string', enum: ['purchase', 'save', 'cut', 'income', 'monthly', 'target', 'goal', 'limit', 'expense', 'edit', 'lookup'] },
  amount: nullable('number'),
  name: nullable('string'),
  at: nullable('integer'),
  category: categoryField,
  pct: nullable('number'),
  delta: nullable('number'),
  set: nullable('number'),
  months: nullable('integer'),
  estimated: nullable('boolean'),
  daysAgo: nullable('integer'),
  text: nullable('string'),
  from: nullable('string'),
  to: nullable('string'),
  last: nullable('boolean'),
  sort: { type: ['string', 'null'], enum: ['date', 'amount', null] },
  toCategory: categoryField,
  remove: nullable('boolean'),
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'changes', 'unclear', 'suggestions'],
  properties: {
    reply: { type: 'string' },
    changes: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: Object.keys(CHANGE_FIELDS), properties: CHANGE_FIELDS },
    },
    unclear: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
};

const langName = (lang) => (lang === 'id' ? 'Bahasa Indonesia' : 'English');
const moneyStyle = (currency) => (currency === 'IDR' ? '"Rp 1.250.000"' : 'the usual local format');

const chatInstructions = ({ lang, currency, month, today, context, streaming }) => `You are Spendify's money assistant inside a personal budgeting app. Reply in the language the person writes in (the app is set to ${langName(lang)}). In Indonesian, be casual and warm and use "kamu"; in English, friendly and plain. The reply and the suggestions must be in the same language. Currency: ${currency}. Current month: ${month}. Today: ${today}.

Their money, as a summary (all amounts in whole ${currency}; categories use the app's English keys):
${JSON.stringify(context)}

How to answer:
- Answer the actual question. Use their real numbers from the summary; never invent figures, limits or goals that aren't there. If the summary lacks something, say so briefly.
- Read the field names carefully: spending is not savings. For "more/less than last month", use changeVsLastMonthBySameDay (positive = spending more). Mid-month, compare with last month by the same day, not with all of last month.
- Be specific and practical: name categories (translate category keys into the reply language), give amounts, compare with last month or their usual month, and suggest 1-3 concrete actions they control.
- Keep it short: at most about 110 words. Use short paragraphs or "- " bullet lines. You may bold a key number with **...**. No headings, no tables, at most one emoji.
- Format money like ${moneyStyle(currency)}, rounded to a friendly amount (e.g. Rp 917.000, not Rp 916.667).
- You are not a licensed financial adviser; don't recommend specific investment products.
- "iou" in the summary is money other people owe them and money they owe others (totals only). It is not part of their budget, spending or savings; mention it only when it matters to the question.
- Never put follow-up ideas, "next steps" lists or the suggestions in the reply: those go only in "suggestions" and the app shows them as buttons.

Changes: return items in "changes" ONLY for the cases A, B and C below. For general questions, analysis or advice, return an empty "changes" array. But a question about specific expenses or transactions (what, where, how many times, which, biggest, list, show) ALWAYS needs a lookup item (C): without it they see nothing. Fill fields that don't apply with null.

A) The "what if" simulator: when the person describes a plan, decision or hypothetical (buying something, saving for something, cutting a category, an income change, a new monthly cost, asking when savings reach an amount). Types:
- purchase: one-off spending in the future or as a hypothetical ("mau beli", "kalau beli", "can I afford"). amount, name (what it is, capitalised, without price or timing), at = months from now (0 = this month; "akhir tahun" = December; "tahun depan" = next January).
- save: put this much MORE into savings every month. amount per month.
- cut: spend less on one category every month. category (allowed values only), and either pct (fraction; 1 = stop completely) or amount per month.
- income: monthly income change. Exactly one of pct (fraction, negative for a decrease), delta (negative for a decrease), set (new total).
- monthly: a new recurring monthly cost (instalment, subscription, rent). amount per month (daily cost x 30), name, months (null if ongoing).
- target: when will savings reach an amount. amount.
- goal: saving up for something specific. amount (total), name, months until they want it (null if not said).
For a goal or a future purchase, return just that one change: don't add a separate "save" change for the monthly amount, the app works that out and shows it.
If they name a specific thing but no price, estimate a typical current price (Indonesian market for IDR), round it, and set estimated to true; otherwise estimated is false.

B) Real settings and records. The app shows a card for each so they can check it and tap to confirm. Nothing is saved until they tap, so never say it is already recorded, added, saved, set or deleted (wrong: "sudah aku catat", "sudah masuk", "I've added it"). Say what the card holds and that they can tap to confirm (right: "Cek dulu, lalu ketuk Tambah ya").
- limit: set (or change) a monthly spending limit for one category, e.g. "batasi jajan 500rb sebulan". category, amount = the monthly cap; amount null to remove a limit. If they ask you to suggest limits without amounts, propose one limit per category worth limiting (at most 4), based on their usual spending and current limits, rounded to friendly amounts.
- expense: they ALREADY spent or paid something and want it recorded ("tadi makan 35rb", "kemarin gojek 20rb", "catat kopi 25rb", "I just paid 150k for electricity"). One item per expense. amount, category (the best fit from the allowed values), name = a short note of what/where in their words (e.g. "Makan warteg", "Gojek ke kantor"), daysAgo (0 = today, 1 = yesterday). Past spending is an expense, not a purchase.
- edit: change or delete an expense they already recorded ("hapus pengeluaran kopi kemarin", "yang tadi harusnya 40rb", "move my last Grab to Transport"). Describe which expense: category, text (a shop, brand or item word from its note, lowercase, e.g. "warteg"; null when the category already says it), from/to (dates YYYY-MM-DD, using dateRanges for yesterday, last week and so on), last = true for "the last one" / "yang tadi". Then either remove = true, or amount (the new amount), or toCategory (the new category). The app finds the matching expenses and they pick one.

C) lookup: they ask about specific expenses or transactions ("what did I buy at Indomaret last week?", "apa aja jajanku minggu ini", "berapa kali naik gojek bulan ini?", "my biggest expenses this month", "show my coffee"). Describe what to look for: category, text (a shop, brand or item word that would be written in the note, lowercase, e.g. "indomaret", "gojek"; null when the category already says it, e.g. "jajan" or "kopi"), from/to (dates YYYY-MM-DD: for today, yesterday, this/last week and this/last month use exactly the dates in dateRanges from the summary), last = true for only the newest one, sort = "amount" for biggest first, otherwise "date". The app searches their expenses on the phone and shows the list and the total right under your reply. You cannot see individual expenses: never guess items, counts or totals for a lookup; reply with one short sentence such as "Here's what I found for coffee this month:".

Amounts are full numbers: "1,5 jt" = 1500000, "200rb" = 200000, "gopek" = 500, "goceng" = 5000, "ceban" = 10000, "sejuta" = 1000000. When you return changes, the reply should briefly say what you set up (the app shows the numbers).
- "unclear": parts of a plan that are too vague to act on. Usually empty.
- "suggestions": 2 or 3 short follow-up things the person might tap next, written as the person would say them, in the reply language, each under 45 characters.
${
  streaming
    ? `
Output format (important): first write the reply for the person as plain text (no JSON, no code fences). Then a new line containing exactly ${MARKER} and then, on the next line, one JSON object with exactly these keys: {"changes": [...], "unclear": [...], "suggestions": [...]}. Every item in "changes" has all of these keys, with null for fields that don't apply: ${Object.keys(CHANGE_FIELDS).join(', ')}. "type" is never null. Write nothing after the JSON object.`
    : ''
}`;

const recapInstructions = ({ lang, currency, context }) => `You are Spendify's money assistant inside a personal budgeting app. Write a short recap of the person's ${
  context.period === 'week' ? 'last week' : 'last month'
} in ${langName(lang)}${lang === 'id' ? ' (casual and warm, use "kamu")' : ' (friendly and plain)'}. Currency: ${currency}.

Their totals for that period and the one before (whole ${currency}; categories use the app's English keys, translate them):
${JSON.stringify(context)}

How to read it: "change" and "changeVsPreviousPeriod" are positive when they spent MORE than the period before, negative when they spent less. ${
  context.period === 'week' ? 'There is no weekly budget: never mention a budget.' : 'spendingBudget is the budget for that month.'
}

Write at most 70 words: one line on how it went (compare with the period before${
  context.period === 'week' ? '' : ', and with the budget'
}), one honest compliment only for something that really went down or stayed under budget, and 1-2 concrete, doable tips for the next ${
  context.period === 'week' ? 'week' : 'month'
} aimed at the categories with the biggest positive change. Use only numbers that are in the summary (or simple differences of them), rounded to friendly amounts formatted like ${moneyStyle(currency)}; never guess other figures. You may bold one key number with **...** and use "- " bullet lines. Plain text only: no headings, no JSON, at most one emoji. Not financial advice about specific investment products.`;

/**
 * The model sometimes leaves "type" null on an item whose other fields make it obvious. Only the
 * unambiguous cases are filled in; everything still goes through cleanChanges afterwards.
 */
export const withTypes = (list) =>
  Array.isArray(list)
    ? list.map((c) => {
        if (!c || typeof c !== 'object' || c.type) return c;
        if (c.remove === true || c.toCategory) return { ...c, type: 'edit' };
        if ((c.text || c.from || c.to || c.last === true) && !c.amount) return { ...c, type: 'lookup' };
        return c;
      })
    : list;

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cleanUnclear = (v) => (Array.isArray(v) ? v.filter((u) => typeof u === 'string').slice(0, 5).map((u) => u.slice(0, 120)) : []);
const cleanSuggestions = (v) => (Array.isArray(v) ? v.map((s) => cleanText(s, 60)).filter(Boolean).slice(0, 3) : []);

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The JSON object in a piece of text, even if wrapped in ``` fences or followed by stray words. */
export const extractJson = (s) => {
  const a = s.indexOf('{');
  const z = s.lastIndexOf('}');
  return a >= 0 && z > a ? safeJson(s.slice(a, z + 1)) : null;
};

/**
 * Splits the streamed model output into the reply (sent as it arrives) and the data after the marker.
 * Holds back the last few characters so a marker split across chunks is never shown to her.
 */
export const replySplitter = () => {
  let full = '';
  let sent = 0;
  let cut = -1;
  return {
    push(chunk) {
      full += chunk;
      if (cut < 0) cut = full.indexOf(MARKER);
      const safe = cut >= 0 ? cut : Math.max(0, full.length - (MARKER.length - 1));
      if (safe <= sent) return '';
      const out = full.slice(sent, safe);
      sent = safe;
      return out;
    },
    finish() {
      let reply = cut >= 0 ? full.slice(0, cut) : full;
      let data = cut >= 0 ? extractJson(full.slice(cut + MARKER.length)) : null;
      // No marker: the model may still have ended the reply with the JSON object
      if (!data) {
        const m = reply.match(/\n\s*(?:```(?:json)?\s*)?(\{[\s\S]*"changes"[\s\S]*\})\s*(?:```)?\s*$/);
        if (m) {
          data = safeJson(m[1]);
          if (data) reply = reply.slice(0, m.index);
        }
      }
      return { reply: reply.trim(), data };
    },
  };
};

const readRequest = (req) => {
  const body = typeof req.body === 'string' ? safeJson(req.body) || {} : req.body || {};
  const currency = /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'IDR';
  const lang = body.lang === 'en' ? 'en' : 'id';
  const context = body.context && typeof body.context === 'object' && JSON.stringify(body.context).length <= 8000 ? body.context : {};
  return { body, currency, lang, context };
};

const groq = (key, payload, signal) =>
  fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, ...payload }),
    signal,
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(503).json({ error: 'not-configured' });

  const { body, currency, lang, context } = readRequest(req);
  const mode = ['recap', 'receipt'].includes(body.mode) ? body.mode : 'chat';
  const text = String(body.text || '').trim().slice(0, MAX_CHARS);
  if (mode === 'chat' && !text) return res.status(400).json({ error: 'empty' });
  const image = typeof body.image === 'string' ? body.image : '';
  if (mode === 'receipt' && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_IMAGE_CHARS)) {
    return res.status(400).json({ error: 'image' });
  }

  const rate = await checkRate(req);
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ error: 'rate-limited', retryAfter: rate.retryAfter });
  }

  if (mode === 'recap') return recap(res, { key, lang, currency, context });
  if (mode === 'receipt') return receipt(res, { key, lang, currency, image, today: /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null });

  // A few earlier turns, so follow-ups like "and coffee?" make sense
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, content: m.text.slice(0, 600) }));
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const today = /^\d{4}-\d{2}-\d{2}$/.test(context.today)
    ? context.today
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const streaming = body.stream === true;
  const system = chatInstructions({ lang, currency, month, today: `${weekday} ${today}`, context, streaming });
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: text }];
  const base = { temperature: 0.3, max_completion_tokens: 2000, reasoning_effort: 'medium', messages };

  return streaming ? chatStream(res, key, base) : chatOnce(res, key, base);
}

/** One strict-JSON call, everything returned at once. */
async function chatOnce(res, key, base) {
  try {
    const r = await groq(
      key,
      { ...base, response_format: { type: 'json_schema', json_schema: { name: 'assistant_reply', strict: true, schema: SCHEMA } } },
      AbortSignal.timeout(15000)
    );
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const out = safeJson(data?.choices?.[0]?.message?.content || '{}') || {};
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      reply: cleanText(out.reply, 1500),
      changes: cleanChanges(withTypes(out.changes)),
      unclear: cleanUnclear(out.unclear),
      suggestions: cleanSuggestions(out.suggestions),
    });
  } catch {
    return res.status(502).json({ error: 'failed' });
  }
}

/** Streams the reply as it is written: NDJSON lines {t:"delta",text}, then {t:"done",…} or {t:"error"}. */
async function chatStream(res, key, base) {
  let r;
  const signal = AbortSignal.timeout(25000);
  try {
    r = await groq(key, { ...base, stream: true }, signal);
  } catch {
    return res.status(502).json({ error: 'failed' });
  }
  if (!r.ok || !r.body) return res.status(502).json({ error: 'upstream', status: r.status });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  const split = replySplitter();

  try {
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const payload = l.slice(5).trim();
        if (payload === '[DONE]') {
          finished = true;
          break;
        }
        // Only the answer is forwarded; any reasoning the model streams separately is ignored
        const piece = safeJson(payload)?.choices?.[0]?.delta?.content;
        if (typeof piece === 'string' && piece) {
          const out = split.push(piece);
          if (out) send({ t: 'delta', text: out });
        }
      }
    }
    const { reply, data } = split.finish();
    send({
      t: 'done',
      reply: cleanText(reply, 1500),
      changes: cleanChanges(withTypes(data?.changes)),
      unclear: cleanUnclear(data?.unclear),
      suggestions: cleanSuggestions(data?.suggestions),
      // false when the data part was missing or broken: the app then reads the plan itself
      dataOk: !!data,
    });
  } catch {
    send({ t: 'error' });
  }
  res.end();
}

async function recap(res, { key, lang, currency, context }) {
  if (!context.period || !Array.isArray(context.categories)) return res.status(400).json({ error: 'empty' });
  try {
    const r = await groq(
      key,
      {
        temperature: 0.2,
        max_completion_tokens: 1500,
        reasoning_effort: 'medium',
        messages: [
          { role: 'system', content: recapInstructions({ lang, currency, context }) },
          { role: 'user', content: lang === 'id' ? 'Tulis rekapku.' : 'Write my recap.' },
        ],
      },
      AbortSignal.timeout(15000)
    );
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const reply = cleanText(data?.choices?.[0]?.message?.content, 800);
    if (!reply) return res.status(502).json({ error: 'empty-reply' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply });
  } catch {
    return res.status(502).json({ error: 'failed' });
  }
}

/* ---------- receipts and payment screenshots ---------- */

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isReceipt', 'amount', 'merchant', 'note', 'date', 'category', 'payment', 'items'],
  properties: {
    isReceipt: { type: 'boolean' },
    amount: nullable('number'),
    merchant: nullable('string'),
    note: nullable('string'),
    date: nullable('string'),
    category: categoryField,
    payment: { type: ['string', 'null'], enum: [...PAYMENT_IDS, null] },
    items: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['name', 'amount'], properties: { name: { type: 'string' }, amount: nullable('number') } },
    },
  },
};

const receiptInstructions = ({ lang, currency, today }) => `You read photos of shop receipts and screenshots of payments (e-wallets like GoPay, OVO, DANA, ShopeePay; bank transfers; QRIS; GoFood/GrabFood/Shopee orders) for a personal budgeting app in Indonesia. Today is ${today}. The app's currency is ${currency}.

Return one JSON object with exactly these keys:
- isReceipt: false if the image is not a receipt, bill, invoice or payment confirmation.
- amount: the final total actually paid, as a plain number in ${currency}: after discounts and vouchers, including tax and service. For a transfer or e-wallet screenshot, the amount paid or sent, never the remaining balance. Indonesian receipts write thousands with dots: "Rp 35.000" = 35000, "1.250.000" = 1250000. Null if you can't read it.
- merchant: the shop, restaurant or recipient name as printed (short, e.g. "Indomaret", "Kopi Kenangan"). Null if not visible.
- note: a short note for the expense in ${lang === 'id' ? 'Bahasa Indonesia' : 'English'} (under 40 characters), usually the merchant, plus what it was if that helps, e.g. "GoFood: Bakso Pak Kumis". Null if unknown.
- date: the transaction date as YYYY-MM-DD. Indonesian receipts usually write DD/MM/YYYY or DD-MM-YY. Null if not visible; never guess.
- category: the best fit from: ${CATEGORY_KEYS.join(', ')}. Supermarket and minimarket food shopping is Groceries; restaurants and food delivery are Dining Out; coffee shops are Coffee; ride-hailing, fuel, parking and tolls are Transport; electricity, water and internet are Bills; phone credit and data are Phone. Null if unclear.
- payment: how it was paid, one of ${PAYMENT_IDS.join(', ')}, or null if not shown. Debit cards and bank transfers are "bank".
- items: the line items if the receipt lists them (at most 15), each { name, amount } with the line total; empty array otherwise.
Read only what is printed; don't invent anything.`;

async function receipt(res, { key, lang, currency, image, today }) {
  const day = today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const messages = [
    { role: 'system', content: receiptInstructions({ lang, currency, today: day }) },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Read this receipt or payment screenshot.' },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ];
  const ask = (response_format) =>
    fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: VISION_MODEL, temperature: 0.1, max_completion_tokens: 1500, messages, response_format }),
      signal: AbortSignal.timeout(30000),
    });
  try {
    let r = await ask({ type: 'json_schema', json_schema: { name: 'receipt', strict: true, schema: RECEIPT_SCHEMA } });
    // Some vision models only take plain JSON mode; the instructions already spell out the keys
    if (r.status === 400) r = await ask({ type: 'json_object' });
    if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status });
    const data = await r.json();
    const out = cleanReceipt(extractJson(data?.choices?.[0]?.message?.content || ''), day);
    if (!out) return res.status(502).json({ error: 'unreadable' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ receipt: out });
  } catch {
    return res.status(502).json({ error: 'failed' });
  }
}
