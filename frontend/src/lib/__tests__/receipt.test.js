import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/understand.js';
import { resetRateLimits } from '../../../api/_ratelimit.js';
import { cleanReceipt } from '../receipt';
import { dataUrlToBlob, fitSize } from '../image';

const call = (body) =>
  new Promise((resolve) => {
    const res = {
      code: 200,
      setHeader() {},
      status(c) {
        this.code = c;
        return this;
      },
      json(j) {
        resolve({ code: this.code, body: j });
      },
    };
    handler({ method: 'POST', body, headers: {} }, res);
  });

const IMG = `data:image/jpeg;base64,${'A'.repeat(200)}`;
const answer = (obj, status = 200) => ({ ok: status === 200, status, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });

describe('cleanReceipt', () => {
  it('keeps what makes sense and drops the rest', () => {
    expect(
      cleanReceipt(
        {
          isReceipt: true,
          amount: '35.000',
          merchant: '  Warteg   Bahari ',
          note: 'Makan siang',
          date: '2026-11-14',
          category: 'Dining Out',
          payment: 'gopay',
          items: [{ name: 'Nasi + ayam', amount: 25000 }, { name: 'Es teh', amount: 5000 }, { name: '', amount: 1 }],
        },
        '2026-11-15'
      )
    ).toEqual({
      isReceipt: true,
      amount: 35000,
      merchant: 'Warteg Bahari',
      note: 'Makan siang',
      date: '2026-11-14',
      category: 'Dining Out',
      payment: 'gopay',
      items: [
        { name: 'Nasi + ayam', amount: 25000 },
        { name: 'Es teh', amount: 5000 },
      ],
    });
  });

  it('reads amounts written as text in either style', () => {
    const amt = (a) => cleanReceipt({ amount: a }, '2026-11-15').amount;
    expect(amt('Rp 1.250.000')).toBe(1250000);
    expect(amt('12.500,50')).toBe(12500.5);
    expect(amt('$1,250.50')).toBe(1250.5);
    expect(amt('42.5')).toBe(42.5);
  });

  it('refuses impossible dates, unknown categories and payments', () => {
    const r = cleanReceipt({ amount: -5, date: '2026-02-30', category: 'Snackz', payment: 'paypal', items: 'x' }, '2026-11-15');
    expect(r).toMatchObject({ amount: null, date: null, category: null, payment: null, items: [] });
    expect(cleanReceipt({ date: '2026-12-01' }, '2026-11-15').date).toBeNull(); // in the future
    expect(cleanReceipt({ date: '2026-11-16' }, '2026-11-15').date).toBe('2026-11-16'); // a day of time-zone slack
    expect(cleanReceipt(null)).toBeNull();
  });
});

describe('fitSize', () => {
  it('shrinks big photos and never upscales', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1789, height: 1342 }); // 2.4 MP cap
    expect(fitSize(1000, 5000)).toEqual({ width: 480, height: 2400 }); // long receipt: height cap
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('dataUrlToBlob', () => {
  it('turns a data URL back into a Blob', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=');
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('hello');
    expect(dataUrlToBlob('nope')).toBeNull();
  });
});

describe('/api/understand receipt mode', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', 'k');
    resetRateLimits();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the image to the vision model and returns a cleaned receipt', async () => {
    const fetch = vi.fn(async () => answer({ isReceipt: true, amount: 85000, merchant: 'Indomaret', note: 'Indomaret', date: '2026-11-14', category: 'Groceries', payment: 'cash', items: [] }));
    vi.stubGlobal('fetch', fetch);
    const r = await call({ mode: 'receipt', image: IMG, today: '2026-11-15', lang: 'id' });
    expect(r.code).toBe(200);
    expect(r.body.receipt).toMatchObject({ amount: 85000, merchant: 'Indomaret', category: 'Groceries', date: '2026-11-14' });
    const sent = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sent.model).toBe('qwen/qwen3.8-27b');
    expect(sent.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: IMG } });
    expect(sent.response_format.type).toBe('json_schema');
  });

  it('falls back to plain JSON mode when strict output is refused', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce(answer({ isReceipt: true, amount: 20000 }));
    vi.stubGlobal('fetch', fetch);
    const r = await call({ mode: 'receipt', image: IMG });
    expect(r.body.receipt.amount).toBe(20000);
    expect(JSON.parse(fetch.mock.calls[1][1].body).response_format).toEqual({ type: 'json_object' });
  });

  it('uses GROQ_VISION_MODEL when set, and rejects anything that is not a small image', async () => {
    vi.stubEnv('GROQ_VISION_MODEL', 'other/vision');
    vi.resetModules();
    const { default: fresh } = await import('../../../api/understand.js');
    const fetch = vi.fn(async () => answer({ isReceipt: false }));
    vi.stubGlobal('fetch', fetch);
    await new Promise((resolve) => fresh({ method: 'POST', headers: {}, body: { mode: 'receipt', image: IMG } }, { setHeader() {}, status() { return this; }, json: resolve }));
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('other/vision');

    expect((await call({ mode: 'receipt', image: 'https://example.com/x.jpg' })).code).toBe(400);
    expect((await call({ mode: 'receipt', image: 'data:image/svg+xml;base64,AAAA' })).code).toBe(400);
    expect((await call({ mode: 'receipt', image: `data:image/jpeg;base64,${'A'.repeat(4_000_001)}` })).code).toBe(400);
  });
});
