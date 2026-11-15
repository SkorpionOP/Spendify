/*
 * Vercel serverless function: stores her encrypted backups in the app owner's Google Drive.
 *
 * The phone encrypts everything first (src/lib/vault.js). This function only ever sees ciphertext and
 * a device id (a one-way hash of her recovery code); it cannot read a backup.
 *
 * Google access: the owner's own account, through a refresh token made once with
 * scripts/backup-setup.mjs. Scope drive.file, so it can touch only the files it created.
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN   required
 *   BACKUP_ALLOWED_DEVICES   optional: comma-separated device ids; once set, nobody else can upload
 *   BACKUP_KEEP              optional: newest backups kept per device (default 14)
 *
 * Drive layout: "Spendify backups" / <device id> / backup-YYYY-MM-DD.json (one per day, replaced).
 *
 * Vercel limits a request to 4.5 MB, so files move in pieces of at most 2.75 MB:
 *   { op: 'start',  deviceId, date, size }            → { session }
 *   { op: 'chunk',  deviceId, session, offset, size, data (base64) } → { done }
 *   { op: 'list',   deviceId }                        → { files: [{ id, name, modifiedTime, size }] }
 *   { op: 'get',    deviceId, fileId, offset }        → { data (base64), size, next }
 */
import { checkRate, originAllowed } from './_ratelimit.js';

export const CHUNK = 11 * 256 * 1024; // 2.75 MB: Drive wants pieces in multiples of 256 KB
const MAX_SIZE = 60 * 1024 * 1024;
const ROOT_NAME = 'Spendify backups';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const DEVICE = /^[0-9a-f]{32}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SESSION = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(\/[\w-]+)?\?[^\s]*upload_id=[\w-]+[^\s]*$/;

class Fail extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/* ---------- Google access (cached while the function stays warm) ---------- */

let token = null; // { value, expires }
let rootId = null;
const folderIds = new Map();

/** For tests. */
export const resetBackupCache = () => {
  token = null;
  rootId = null;
  folderIds.clear();
};

const accessToken = async () => {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, GOOGLE_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) throw new Fail(503, 'not-configured');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: refresh }),
  });
  if (!r.ok) throw new Fail(502, 'google-auth'); // e.g. the refresh token was revoked or expired
  const j = await r.json();
  token = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
  return token.value;
};

const google = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, ...(init.headers || {}) } });
  if (r.status === 401) token = null;
  return r;
};

const ok = async (r) => {
  if (r.ok) return r;
  const body = await r.text().catch(() => '');
  throw new Fail(r.status === 403 && /storageQuotaExceeded/.test(body) ? 507 : 502, r.status === 403 && /storageQuotaExceeded/.test(body) ? 'drive-full' : 'drive');
};

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const findOrMake = async (name, parent, create = true) => {
  const where = `mimeType='${FOLDER}' and name=${q(name)} and trashed=false${parent ? ` and ${q(parent)} in parents` : ''}`;
  const r = await ok(await google(`${API}/files?${new URLSearchParams({ q: where, fields: 'files(id)', pageSize: '1', spaces: 'drive' })}`));
  const found = (await r.json()).files?.[0]?.id;
  if (found || !create) return found || null;
  const made = await ok(
    await google(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
    })
  );
  return (await made.json()).id;
};

/** The device's folder. Only uploads create it; looking up an unknown device returns null. */
const deviceFolder = async (deviceId, create = false) => {
  if (folderIds.has(deviceId)) return folderIds.get(deviceId);
  rootId ||= await findOrMake(ROOT_NAME, null, create);
  if (!rootId) return null;
  const id = await findOrMake(deviceId, rootId, create);
  if (id) folderIds.set(deviceId, id);
  return id;
};

const listFiles = async (folder) => {
  const where = `${q(folder)} in parents and trashed=false and mimeType!='${FOLDER}'`;
  const r = await ok(await google(`${API}/files?${new URLSearchParams({ q: where, fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '100', spaces: 'drive' })}`));
  return ((await r.json()).files || []).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: Number(f.size) || 0 }));
};

const keep = () => Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

/* ---------- operations ---------- */

const start = async ({ deviceId, date, size }) => {
  if (!DATE.test(date)) throw new Fail(400, 'date');
  if (!(Number.isInteger(size) && size > 0 && size <= MAX_SIZE)) throw new Fail(413, 'size');
  const folder = await deviceFolder(deviceId, true);
  const name = `backup-${date}.json`;
  const existing = (await listFiles(folder)).find((f) => f.name === name);
  const r = await ok(
    await google(existing ? `${UPLOAD}/files/${existing.id}?uploadType=resumable&fields=id` : `${UPLOAD}/files?uploadType=resumable&fields=id`, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/json', 'x-upload-content-length': String(size) },
      body: JSON.stringify(existing ? {} : { name, parents: [folder], mimeType: 'application/json' }),
    })
  );
  const session = r.headers.get('location');
  if (!session || !SESSION.test(session)) throw new Fail(502, 'drive');
  return { session };
};

const chunk = async ({ deviceId, session, offset, size, data }) => {
  // Only ever talk to a Google upload session, never to an address someone sends us
  if (typeof session !== 'string' || !SESSION.test(session)) throw new Fail(400, 'session');
  if (!(Number.isInteger(size) && size > 0 && size <= MAX_SIZE && Number.isInteger(offset) && offset >= 0 && offset < size)) throw new Fail(400, 'range');
  const bytes = Buffer.from(String(data || ''), 'base64');
  const last = offset + bytes.length === size;
  if (!bytes.length || bytes.length > CHUNK || (!last && bytes.length % (256 * 1024) !== 0) || offset + bytes.length > size) throw new Fail(400, 'range');
  const r = await google(session, {
    method: 'PUT',
    headers: { 'content-length': String(bytes.length), 'content-range': `bytes ${offset}-${offset + bytes.length - 1}/${size}` },
    body: bytes,
  });
  if (r.status === 308) return { done: false };
  await ok(r);
  // Finished: drop the oldest backups beyond the newest few. Never fails a good backup.
  try {
    const folder = await deviceFolder(deviceId);
    const old = folder ? (await listFiles(folder)).slice(keep()) : [];
    for (const f of old) await google(`${API}/files/${f.id}`, { method: 'DELETE' });
  } catch {
    /* tidy up next time */
  }
  return { done: true };
};

const list = async ({ deviceId }) => {
  const folder = await deviceFolder(deviceId);
  return { files: folder ? (await listFiles(folder)).slice(0, keep()) : [] };
};

const get = async ({ deviceId, fileId, offset = 0 }) => {
  if (typeof fileId !== 'string' || !/^[\w-]{10,}$/.test(fileId) || !Number.isInteger(offset) || offset < 0) throw new Fail(400, 'file');
  // The file must be in this device's folder: a device id can't read anyone else's backups
  const meta = await ok(await google(`${API}/files/${fileId}?fields=parents,size`));
  const { parents = [], size } = await meta.json();
  const folder = await deviceFolder(deviceId);
  if (!folder || !parents.includes(folder)) throw new Fail(404, 'file');
  const total = Number(size) || 0;
  if (offset >= total) return { data: '', size: total, next: null };
  const end = Math.min(total, offset + CHUNK) - 1;
  const r = await ok(await google(`${API}/files/${fileId}?alt=media`, { headers: { range: `bytes=${offset}-${end}` } }));
  const buf = Buffer.from(await r.arrayBuffer());
  return { data: buf.toString('base64'), size: total, next: end + 1 < total ? end + 1 : null };
};

const OPS = { start, chunk, list, get };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch {
    return res.status(400).json({ error: 'body' });
  }
  const op = OPS[body.op];
  if (!op) return res.status(400).json({ error: 'op' });
  if (!DEVICE.test(body.deviceId || '')) return res.status(400).json({ error: 'device' });
  const allowed = String(process.env.BACKUP_ALLOWED_DEVICES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(body.deviceId)) return res.status(403).json({ error: 'device' });

  const rate = await checkRate(req, Date.now(), { scope: 'backup', minute: 60, day: 600 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ error: 'rate-limited', retryAfter: rate.retryAfter });
  }

  try {
    const out = await op(body);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (err) {
    const status = err instanceof Fail ? err.status : 502;
    return res.status(status).json({ error: err instanceof Fail ? err.code : 'failed' });
  }
}
