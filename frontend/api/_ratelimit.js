/*
 * Rate limiting for the AI endpoint, so a public deployment can't burn through the Groq quota.
 *
 * Counts requests per visitor (a hash of the IP address, never the address itself) in fixed windows:
 * per minute and per day. Limits come from AI_RATE_PER_MINUTE / AI_RATE_PER_DAY.
 *
 * Where the counts live:
 * - Upstash Redis (or Vercel KV, which is Upstash) when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   (or KV_REST_API_URL + KV_REST_API_TOKEN) are set. Shared by every server instance: the real limit.
 * - Otherwise in this instance's memory. Best effort only: each serverless instance counts on its own
 *   and forgets on a cold start, but it still stops one client hammering a warm instance.
 * If Redis can't be reached, memory is used for that request, so the app keeps working.
 */
import { createHash } from 'node:crypto';

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const limits = () => ({
  minute: num(process.env.AI_RATE_PER_MINUTE, 12),
  day: num(process.env.AI_RATE_PER_DAY, 150),
});

const header = (req, name) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
};

/** Who is asking: the first address in x-forwarded-for (set by Vercel), hashed. */
export const clientKey = (req) => {
  const ip = String(header(req, 'x-forwarded-for') || '').split(',')[0].trim() || header(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(`spendify:${ip}`).digest('hex').slice(0, 24);
};

/* ---------- in-memory counts ---------- */

const memory = new Map(); // key → { count, expires }

const bumpMemory = (key, ttlMs, now) => {
  const cur = memory.get(key);
  if (!cur || cur.expires <= now) {
    memory.set(key, { count: 1, expires: now + ttlMs });
    return 1;
  }
  cur.count++;
  return cur.count;
};

const sweep = (now) => {
  if (memory.size < 5000) return;
  for (const [k, v] of memory) if (v.expires <= now) memory.delete(k);
};

/** For tests. */
export const resetRateLimits = () => memory.clear();

/* ---------- Redis (Upstash REST) ---------- */

const redisConfig = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
};

const bumpRedis = async ({ url, token }, keys) => {
  const commands = keys.flatMap(([key, ttlSec]) => [
    ['INCR', key],
    ['EXPIRE', key, String(ttlSec), 'NX'],
  ]);
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(1500),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return keys.map((_, i) => Number(out?.[i * 2]?.result));
};

/**
 * Counts this request. Returns { ok: true } or { ok: false, retryAfter } (seconds).
 */
export const checkRate = async (req, now = Date.now()) => {
  const who = clientKey(req);
  const { minute, day } = limits();
  const minuteSlot = Math.floor(now / 60_000);
  const daySlot = Math.floor(now / 86_400_000);
  const keys = [
    [`rl:ai:${who}:m:${minuteSlot}`, 60],
    [`rl:ai:${who}:d:${daySlot}`, 86_400],
  ];

  let counts = null;
  const redis = redisConfig();
  if (redis) {
    try {
      counts = await bumpRedis(redis, keys);
      if (counts.some((n) => !Number.isFinite(n))) counts = null;
    } catch {
      counts = null; // fall back to memory below
    }
  }
  if (!counts) {
    sweep(now);
    counts = keys.map(([key, ttl]) => bumpMemory(key, ttl * 1000, now));
  }

  const [perMinute, perDay] = counts;
  if (perDay > day) return { ok: false, retryAfter: Math.ceil(((daySlot + 1) * 86_400_000 - now) / 1000) };
  if (perMinute > minute) return { ok: false, retryAfter: Math.ceil(((minuteSlot + 1) * 60_000 - now) / 1000) };
  return { ok: true };
};

/**
 * Only the app's own pages may call the endpoint. Browsers send Origin on POST; when it is present it
 * must match this site's host, or one of ALLOWED_ORIGINS (comma-separated). Requests without an
 * Origin (curl, server-to-server) are still rate limited.
 */
export const originAllowed = (req) => {
  const origin = header(req, 'origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = header(req, 'x-forwarded-host') || header(req, 'host');
  if (own && host === own) return true;
  const extra = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.some((o) => o === origin || o === host);
};
