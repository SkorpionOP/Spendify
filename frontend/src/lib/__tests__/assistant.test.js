import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { MARKER, replySplitter, withTypes } from '../../../api/understand.js';
import { checkRate, originAllowed, resetRateLimits } from '../../../api/_ratelimit.js';
import { cleanChanges, isAction } from '../changes';
import { findExpenses, findExpensesLoose, summarizeExpenses } from '../lookup';
import { understand } from '../nlu';
import { askAI } from '../ai';
import { dateRanges, recapContext } from '../aicontext';
import { configure } from '../i18n';
import { normalize } from '../money';
import { detectCategoryFromNote } from '../guesscat';

/* ---------- helpers ---------- */

// A fake Vercel response that also records streamed writes
const call = (body, { method = 'POST', headers = {} } = {}) =>
  new Promise((resolve) => {
    const res = {
      headers: {},
      code: 200,
      chunks: [],
      set statusCode(c) {
        this.code = c;
      },
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      status(c) {
        this.code = c;
        return this;
      },
      json(j) {
        resolve({ code: this.code, body: j, headers: this.headers });
      },
      write(chunk) {
        this.chunks.push(chunk);
      },
      end() {
        resolve({ code: this.code, lines: this.chunks.join('').trim().split('\n').map((l) => JSON.parse(l)), headers: this.headers });
      },
    };
    handler({ method, body, headers }, res);
  });

// Groq's streamed answer: server-sent events with content deltas
const sse = (pieces) => {
  const enc = new TextEncoder();
  const events = [...pieces.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`), 'data: [DONE]\n\n'];
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(e));
      c.close();
    },
  });
};
const aiStreams = (pieces) => vi.fn(async () => ({ ok: true, status: 200, body: sse(pieces) }));

const DATA = {
  changes: [{ type: 'expense', amount: 35000, category: 'Dining Out', name: 'Makan warteg', daysAgo: 0 }],
  unclear: [],
  suggestions: ['Lihat jajan minggu ini'],
};

/* ---------- the endpoint ---------- */

describe('/api/understand streaming', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'k');
    resetRateLimits();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('streams the reply and never shows the data part, even when the marker is split across chunks', async () => {
    const full = `Oke, aku catat ya. Ketuk Tambah.\n${MARKER}\n${JSON.stringify(DATA)}`;
    const cut = full.indexOf(MARKER) + 4; // split in the middle of the marker
    const fetch = aiStreams([full.slice(0, 10), full.slice(10, cut), full.slice(cut)]);
    vi.stubGlobal('fetch', fetch);
    const r = await call({ text: 'tadi makan 35rb di warteg', stream: true });
    expect(r.code).toBe(200);
    expect(r.headers['content-type']).toContain('ndjson');
    const deltas = r.lines.filter((l) => l.t === 'delta').map((l) => l.text).join('');
    expect(deltas).not.toContain('<<<');
    expect(deltas.trim()).toBe('Oke, aku catat ya. Ketuk Tambah.');
    const done = r.lines.at(-1);
    expect(done).toMatchObject({ t: 'done', reply: 'Oke, aku catat ya. Ketuk Tambah.', dataOk: true, suggestions: ['Lihat jajan minggu ini'] });
    expect(done.changes).toEqual([{ type: 'expense', amount: 35000, category: 'Dining Out', name: 'Makan warteg', daysAgo: 0 }]);
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.stream).toBe(true);
    expect(sent.response_format).toBeUndefined();
    expect(sent.messages[0].content).toContain(MARKER);
  });

  it('says dataOk false when the data part is missing, so the app can read the plan itself', async () => {
    vi.stubGlobal('fetch', aiStreams(['Just a reply.']));
    const r = await call({ text: 'hi', stream: true });
    expect(r.lines.at(-1)).toMatchObject({ t: 'done', reply: 'Just a reply.', changes: [], dataOk: false });
  });

  it('recovers JSON the model put at the end without the marker', async () => {
    vi.stubGlobal('fetch', aiStreams([`Here you go.\n\`\`\`json\n${JSON.stringify(DATA)}\n\`\`\``]));
    const r = await call({ text: 'x', stream: true });
    expect(r.lines.at(-1)).toMatchObject({ reply: 'Here you go.', dataOk: true });
    expect(r.lines.at(-1).changes).toHaveLength(1);
  });

  it('writes recaps from period totals', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Minggu yang hemat! 🎉' } }] }) }));
    vi.stubGlobal('fetch', fetch);
    const r = await call({ mode: 'recap', context: { period: 'week', categories: [] }, lang: 'id' });
    expect(r).toMatchObject({ code: 200, body: { reply: 'Minggu yang hemat! 🎉' } });
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content).toContain('last week');
    expect((await call({ mode: 'recap', context: {} })).code).toBe(400);
  });
});

describe('rate limit and origin', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'k');
    resetRateLimits();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('answers 429 with Retry-After once a visitor goes over the per-minute limit', async () => {
    vi.stubEnv('AI_RATE_PER_MINUTE', '2');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"ok","changes":[],"unclear":[],"suggestions":[]}' } }] }) })));
    const me = { 'x-forwarded-for': '1.2.3.4' };
    expect((await call({ text: 'a' }, { headers: me })).code).toBe(200);
    expect((await call({ text: 'b' }, { headers: me })).code).toBe(200);
    const third = await call({ text: 'c' }, { headers: me });
    expect(third.code).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    // Someone else is not affected
    expect((await call({ text: 'd' }, { headers: { 'x-forwarded-for': '5.6.7.8' } })).code).toBe(200);
  });

  it('has a daily limit too, and resets the minute window', async () => {
    vi.stubEnv('AI_RATE_PER_MINUTE', '5');
    vi.stubEnv('AI_RATE_PER_DAY', '3');
    const req = { headers: { 'x-forwarded-for': '9.9.9.9' } };
    const t0 = Date.UTC(2026, 10, 15, 10, 0, 0);
    expect((await checkRate(req, t0)).ok).toBe(true);
    expect((await checkRate(req, t0 + 61_000)).ok).toBe(true);
    expect((await checkRate(req, t0 + 122_000)).ok).toBe(true);
    const r = await checkRate(req, t0 + 183_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(3600);
  });

  it('uses Upstash when configured, and falls back to memory if it fails', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    const redis = vi.fn(async () => ({ ok: true, json: async () => [{ result: 99 }, { result: 1 }, { result: 1 }, { result: 1 }] }));
    vi.stubGlobal('fetch', redis);
    expect((await checkRate({ headers: {} })).ok).toBe(false);
    expect(redis.mock.calls[0][0]).toBe('https://redis.example/pipeline');
    // Keys hold a hash, never the IP itself
    expect(redis.mock.calls[0][1].body).not.toContain('1.2.3.4');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect((await checkRate({ headers: {} })).ok).toBe(true);
  });

  it('only lets the app’s own pages call it from a browser', async () => {
    expect(originAllowed({ headers: { origin: 'https://spendify.app', host: 'spendify.app' } })).toBe(true);
    expect(originAllowed({ headers: { origin: 'https://evil.example', host: 'spendify.app' } })).toBe(false);
    expect(originAllowed({ headers: {} })).toBe(true);
    vi.stubEnv('ALLOWED_ORIGINS', 'https://preview.example');
    expect(originAllowed({ headers: { origin: 'https://preview.example', host: 'spendify.app' } })).toBe(true);
    const r = await call({ text: 'x' }, { headers: { origin: 'https://evil.example', host: 'spendify.app' } });
    expect(r.code).toBe(403);
  });
});

describe('withTypes', () => {
  it('fills in an obvious missing type, and nothing else', () => {
    expect(withTypes([{ type: null, text: 'indomaret', from: '2026-11-02', amount: null }])[0].type).toBe('lookup');
    expect(withTypes([{ type: null, last: true, remove: true }])[0].type).toBe('edit');
    expect(withTypes([{ type: null, amount: 5000, text: 'kopi' }])[0].type).toBeNull();
    expect(withTypes([{ type: 'save', amount: 1 }])[0].type).toBe('save');
  });
});

describe('replySplitter', () => {
  it('holds back a partial marker until it knows', () => {
    const s = replySplitter();
    let shown = '';
    for (const ch of `Hello there\n${MARKER}{"changes":[]}`) shown += s.push(ch);
    expect(shown).toBe('Hello there\n');
    expect(s.finish()).toEqual({ reply: 'Hello there', data: { changes: [] } });
  });
});

/* ---------- the app side ---------- */

describe('askAI (client)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the stream, reports progress, and returns the final answer', async () => {
    const enc = new TextEncoder();
    const lines = [{ t: 'delta', text: 'Hel' }, { t: 'delta', text: 'lo' }, { t: 'done', reply: 'Hello', changes: [{ type: 'save', amount: 1e5 }], unclear: [], suggestions: [], dataOk: true }];
    const body = new ReadableStream({
      start(c) {
        // split a line across chunks on purpose
        const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
        c.enqueue(enc.encode(text.slice(0, 15)));
        c.enqueue(enc.encode(text.slice(15)));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })));
    const seen = [];
    const r = await askAI({ text: 'x', context: {}, onDelta: (s) => seen.push(s) });
    expect(seen).toEqual(['Hel', 'Hello']);
    expect(r).toMatchObject({ reply: 'Hello', changes: [{ type: 'save', amount: 1e5 }], dataOk: true });
  });

  it('tells the app when it is rate limited, and returns null on errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'rate-limited', retryAfter: 30 }), { status: 429 })));
    expect(await askAI({ text: 'x', context: {} })).toEqual({ limited: true, retryAfter: 30 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })));
    expect(await askAI({ text: 'x', context: {} })).toBeNull();
  });
});

describe('cleanChanges: expenses, edits and lookups', () => {
  it('keeps good ones and drops unusable ones', () => {
    const out = cleanChanges([
      { type: 'expense', amount: 35000, category: 'Food', name: 'Makan', daysAgo: 1 },
      { type: 'expense', amount: 0, category: 'Food' },
      { type: 'expense', amount: 5000, category: 'Nope', daysAgo: 999 },
      { type: 'edit', last: true, remove: true },
      { type: 'edit', text: 'kopi', amount: 40000 },
      { type: 'edit', remove: true }, // which one? dropped
      { type: 'edit', category: 'Coffee' }, // change what? dropped
      { type: 'lookup', category: 'Coffee', from: '2026-11-30', to: '2026-11-01', sort: 'amount' },
      { type: 'lookup', from: 'yesterday' }, // no usable filter
    ]);
    expect(out).toEqual([
      { type: 'expense', amount: 35000, category: 'Food', name: 'Makan', daysAgo: 1 },
      { type: 'expense', amount: 5000, category: null, name: '', daysAgo: 60 },
      { type: 'edit', category: null, text: null, from: null, to: null, last: true, remove: true, amount: null, toCategory: null },
      { type: 'edit', category: null, text: 'kopi', from: null, to: null, last: false, remove: false, amount: 40000, toCategory: null },
      { type: 'lookup', category: 'Coffee', text: null, from: '2026-11-01', to: '2026-11-30', last: false, sort: 'amount' },
    ]);
    expect(out.every(isAction)).toBe(true);
  });
});

describe('findExpenses', () => {
  const list = [
    { id: 'a', date: '2026-11-01', amount: 20000, category: 'Coffee', note: 'Kopi Kenangan', createdAt: 1 },
    { id: 'b', date: '2026-11-03', amount: 85000, category: 'Groceries', note: 'Indomaret', createdAt: 2 },
    { id: 'c', date: '2026-11-03', amount: 25000, category: 'Coffee', note: 'kopi', createdAt: 3 },
    { id: 'd', date: '2026-10-20', amount: 30000, category: 'Coffee', note: '', createdAt: 0 },
  ];
  it('filters by category, words in the note and dates, newest first', () => {
    expect(findExpenses(list, { category: 'Coffee', from: '2026-11-01', to: '2026-11-30' }).map((e) => e.id)).toEqual(['c', 'a']);
    expect(findExpenses(list, { text: 'INDOMARET' }).map((e) => e.id)).toEqual(['b']);
    expect(findExpenses(list, { last: true }).map((e) => e.id)).toEqual(['c']);
    expect(findExpenses(list, { sort: 'amount' }).map((e) => e.id)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('drops the note words when they match nothing but a category or dates were given', () => {
    expect(findExpensesLoose(list, { category: 'Coffee', text: 'latte' }).map((e) => e.id)).toEqual(['c', 'a', 'd']);
    expect(findExpensesLoose(list, { text: 'latte' })).toEqual([]);
  });
  it('sums them up', () => {
    expect(summarizeExpenses(list)).toEqual({
      count: 4,
      total: 160000,
      byCategory: [
        { category: 'Groceries', amount: 85000 },
        { category: 'Coffee', amount: 75000 },
      ],
    });
  });
});

describe('offline reader: expenses and lookups', () => {
  const now = new Date(2026, 10, 15, 12); // Sunday 15 Nov 2026
  configure({ lang: 'id', currency: 'IDR', payday: 1 });
  const one = (s) => understand(s, now).changes[0];

  it('logs what she already spent, with the day', () => {
    expect(one('tadi makan 35rb di warteg')).toEqual({ type: 'expense', amount: 35000, category: 'Dining Out', name: 'Makan warteg', daysAgo: 0 });
    expect(one('kemarin gojek 20rb')).toMatchObject({ type: 'expense', amount: 20000, category: 'Transport', daysAgo: 1 });
    expect(one('spent 50k on coffee')).toMatchObject({ type: 'expense', amount: 50000, category: 'Coffee' });
  });

  it('keeps plans as plans', () => {
    expect(one('beli HP 3 juta bulan depan')).toMatchObject({ type: 'purchase', at: 1 });
    expect(one('habis gajian nabung 500rb')).toEqual({ type: 'save', amount: 500000 });
  });

  it('finds expenses by category, place and time', () => {
    expect(one('apa aja jajanku minggu ini')).toMatchObject({ type: 'lookup', category: 'Snacks', from: '2026-11-09', to: '2026-11-15' });
    expect(one('berapa total ngopi bulan lalu')).toMatchObject({ type: 'lookup', category: 'Coffee', from: '2026-10-01', to: '2026-10-31' });
    expect(one('what did i buy at indomaret last week')).toMatchObject({ type: 'lookup', text: 'indomaret', from: '2026-11-02', to: '2026-11-08' });
  });

  it('deletes the last one when asked', () => {
    expect(one('hapus pengeluaran terakhir')).toMatchObject({ type: 'edit', last: true, remove: true });
  });
});

describe('category guess', () => {
  it('matches at the start of words only', () => {
    expect(detectCategoryFromNote('electricity')).toBe('Bills');
    expect(detectCategoryFromNote('pulsa tri 50rb')).toBe('Phone');
    expect(detectCategoryFromNote('kopi kenangan')).toBe('Coffee');
  });
});

describe('recapContext', () => {
  it('sends period totals, never notes or her name', () => {
    const state = normalize({
      profile: { name: 'Putri Secret' },
      startMonth: '2026-10',
      plans: { '2026-10': { salary: 6_000_000, needsPercent: 70 } },
      expenses: [
        { id: '1', date: '2026-11-03', amount: 40000, category: 'Coffee', note: 'kopi sama mantan', createdAt: 1 },
        { id: '2', date: '2026-11-04', amount: 60000, category: 'Coffee', note: '', createdAt: 2 },
        { id: '3', date: '2026-10-28', amount: 30000, category: 'Coffee', note: '', createdAt: 3 },
      ],
    });
    const ctx = recapContext(state, { kind: 'week', from: '2026-11-02', to: '2026-11-08', prevFrom: '2026-10-26', prevTo: '2026-11-01' }, new Date(2026, 10, 10));
    expect(ctx).toMatchObject({ period: 'week', totalSpent: 100000, purchases: 2, previousPeriodSpent: 30000, daysWithNoSpending: 5 });
    expect(ctx.categories[0]).toEqual({ category: 'Coffee', spent: 100000, purchases: 2, spentPreviousPeriod: 30000, change: 70000 });
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('mantan');
    expect(json).not.toContain('Putri');
  });
});

describe('dateRanges', () => {
  it('gives the AI the same weeks and months the app uses', () => {
    configure({ lang: 'id', currency: 'IDR', payday: 1 });
    expect(dateRanges(new Date(2026, 10, 15, 12))).toEqual({
      yesterday: '2026-11-14',
      thisWeek: { from: '2026-11-09', to: '2026-11-15' },
      lastWeek: { from: '2026-11-02', to: '2026-11-08' },
      thisMonth: { from: '2026-11-01', to: '2026-11-15' },
      lastMonth: { from: '2026-10-01', to: '2026-10-31' },
    });
  });
});
