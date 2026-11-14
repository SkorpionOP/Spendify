import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/understand.js';
import { cleanChanges } from '../changes';

// A fake request/response pair for the Vercel handler
const call = (body, method = 'POST') =>
  new Promise((resolve) => {
    const res = {
      headers: {},
      code: 200,
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(c) {
        this.code = c;
        return this;
      },
      json(j) {
        resolve({ code: this.code, body: j });
      },
    };
    handler({ method, body }, res);
  });

const aiSays = (obj) => vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) }));

describe('/api/understand', () => {
  beforeEach(() => vi.stubEnv('GROQ_API_KEY', 'test-key'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends only the sentence, with the key in a header, and returns cleaned changes', async () => {
    const fetch = aiSays({
      changes: [
        { type: 'purchase', amount: 20000000, name: 'Ke Jepang', at: 1 },
        { type: 'cut', category: 'Coffee', pct: 1 },
        { type: 'cut', category: 'NotACategory', pct: 0.5 },
        { type: 'hack', amount: 1 },
      ],
      unclear: ['aku mau nikah'],
      reply: 'Oke!',
      suggestions: ['Lagi?'],
    });
    vi.stubGlobal('fetch', fetch);
    const r = await call({ text: 'mau ke jepang 20jt, stop ngopi, aku mau nikah', currency: 'IDR' });
    expect(r.code).toBe(200);
    expect(r.body).toEqual({
      reply: 'Oke!',
      suggestions: ['Lagi?'],
      changes: [
        { type: 'purchase', amount: 20000000, name: 'Ke Jepang', at: 1 },
        { type: 'cut', category: 'Coffee', pct: 1 },
      ],
      unclear: ['aku mau nikah'],
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).not.toContain('test-key');
    expect(init.headers.authorization).toBe('Bearer test-key');
    const sent = JSON.parse(init.body);
    expect(sent.messages.at(-1)).toEqual({ role: 'user', content: 'mau ke jepang 20jt, stop ngopi, aku mau nikah' });
    expect(sent.response_format.json_schema.strict).toBe(true);
  });

  it('says so when the key is missing or the AI fails', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GROQ_API_KEY', '');
    expect((await call({ text: 'x' })).code).toBe(503);
    vi.stubEnv('GROQ_API_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    expect(await call({ text: 'beli hp' })).toEqual({ code: 502, body: { error: 'upstream', status: 429 } });
  });

  it('rejects empty text and other methods, and trims long input', async () => {
    expect((await call({ text: '  ' })).code).toBe(400);
    expect((await call({}, 'GET')).code).toBe(405);
    const fetch = aiSays({ changes: [], unclear: [] });
    vi.stubGlobal('fetch', fetch);
    await call({ text: 'a'.repeat(1000) });
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages.at(-1).content).toHaveLength(400);
  });
});

describe('cleanChanges', () => {
  it('keeps good changes and fixes common slips', () => {
    expect(
      cleanChanges([
        { type: 'income', pct: 10 }, // meant 10%
        { type: 'save', amount: '200000' },
        { type: 'monthly', amount: 800000, name: 'Cicilan motor', months: 12 },
        { type: 'purchase', amount: -5 },
        { type: 'target', amount: 0 },
        null,
      ])
    ).toEqual([
      { type: 'income', pct: 0.1 },
      { type: 'save', amount: 200000 },
      { type: 'monthly', amount: 800000, name: 'Cicilan motor', months: 12 },
    ]);
  });
});

describe('estimated prices', () => {
  it('keeps the estimated flag only when the AI says so', () => {
    expect(cleanChanges([{ type: 'goal', amount: 5e6, name: 'iQOO', months: 6, estimated: true }, { type: 'purchase', amount: 1e6, name: 'Tas', at: 0, estimated: false }])).toEqual([
      { type: 'goal', amount: 5e6, name: 'iQOO', months: 6, estimated: true },
      { type: 'purchase', amount: 1e6, name: 'Tas', at: 0 },
    ]);
  });
});

