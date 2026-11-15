/* global Buffer */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { resetBackupCache } from '../../../api/backup.js';
import { resetRateLimits } from '../../../api/_ratelimit.js';
import { decryptWithOwnerKey, deviceIdFor, newOwnerKeyPair, newRecoveryCode } from '../vault';

const owner = await newOwnerKeyPair();
vi.stubEnv('VITE_BACKUP_PUBLIC_KEY', owner.publicKey);
const { backupDue, cloudBackup, CHUNK, listCloudBackups, restoreCloudBackup } = await import('../cloud');

/* ---------- a fake Google: token endpoint + the bits of Drive the server uses ---------- */
const fakeGoogle = () => {
  const files = new Map();
  const sessions = new Map();
  let n = 0;
  let clock = Date.UTC(2026, 10, 1);
  const tokens = { issued: 0 };
  const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers });

  const google = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    if (u.host === 'oauth2.googleapis.com') {
      const p = new URLSearchParams(init.body);
      if (p.get('refresh_token') !== 'refresh-ok') return json({ error: 'invalid_grant' }, 400);
      tokens.issued++;
      return json({ access_token: 'access-ok', expires_in: 3600 });
    }
    if (init.headers?.authorization !== 'Bearer access-ok') return json({}, 401);
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q');
      let out = [...files.values()];
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      if (parent) out = out.filter((f) => f.parents?.includes(parent));
      else out = out.filter((f) => !f.parents);
      if (q.includes("mimeType='application/vnd.google-apps.folder'")) out = out.filter((f) => f.folder && q.includes(`name='${f.name}'`));
      else out = out.filter((f) => !f.folder).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
      return json({ files: out.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, size: String(f.body?.length || 0) })) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(init.body);
      const id = `folder${++n}xxxxxxxx`;
      files.set(id, { id, name: meta.name, folder: true, parents: meta.parents });
      return json({ id });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files') && ['POST', 'PATCH'].includes(method)) {
      const id = method === 'PATCH' ? u.pathname.split('/').pop() : `file${++n}xxxxxxxxxx`;
      const session = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=up${++n}`;
      sessions.set(session, { id, meta: JSON.parse(init.body), parts: [], size: Number(init.headers['x-upload-content-length']) });
      return json({}, 200, { location: session });
    }
    if (sessions.has(url) && method === 'PUT') {
      const s = sessions.get(url);
      const [, start, end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(init.headers['content-range']).map(Number);
      expect(init.body.length).toBe(end - start + 1);
      s.parts.push(Buffer.from(init.body));
      if (end + 1 < total) return new Response(null, { status: 308 });
      const prev = files.get(s.id) || {};
      files.set(s.id, { ...prev, ...s.meta, id: s.id, body: Buffer.concat(s.parts), modifiedTime: new Date((clock += 60000)).toISOString() });
      return json({ id: s.id });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (one && method === 'DELETE') {
      files.delete(one[1]);
      return new Response(null, { status: 204 });
    }
    if (one && u.searchParams.get('fields') === 'parents,size') {
      const f = files.get(one[1]);
      return f ? json({ parents: f.parents, size: String(f.body.length) }) : json({}, 404);
    }
    if (one && u.searchParams.get('alt') === 'media') {
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(init.headers.range).map(Number);
      return new Response(files.get(one[1]).body.subarray(a, b + 1), { status: 206 });
    }
    return json({ error: 'unexpected', url, method }, 500);
  };
  return { google, files, tokens };
};

/* Routes the app's /api/backup calls to the real handler, and its Google calls to the fake */
const wire = (g) =>
  vi.fn(async (url, init = {}) => {
    if (url === '/api/backup') {
      return new Promise((resolve) => {
        const res = {
          code: 200,
          headers: {},
          setHeader(k, v) {
            this.headers[k] = v;
          },
          status(c) {
            this.code = c;
            return this;
          },
          json(j) {
            resolve(new Response(JSON.stringify(j), { status: this.code }));
          },
        };
        handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: JSON.parse(init.body) }, res);
      });
    }
    return g.google(url, init);
  });

const backupJson = (n = 3) =>
  JSON.stringify({ version: 2, profile: { name: 'Putri' }, expenses: Array.from({ length: n }, (_, i) => ({ id: `e${i}`, amount: 1000 + i, note: `Kopi ${i}`, date: '2026-11-15' })) });

describe('automatic backup to the owner’s Drive', () => {
  let g;
  beforeEach(() => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'refresh-ok');
    resetBackupCache();
    resetRateLimits();
    g = fakeGoogle();
    vi.stubGlobal('fetch', wire(g));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_BACKUP_PUBLIC_KEY', owner.publicKey);
  });

  it('backs up, lists and restores with the recovery code; the Drive holds only ciphertext', async () => {
    const code = newRecoveryCode();
    const json = backupJson();
    const done = await cloudBackup({ getJson: async () => json, code, date: '2026-11-15' });
    expect(done.deviceId).toBe(await deviceIdFor(code));

    const stored = [...g.files.values()].find((f) => !f.folder);
    expect(stored.name).toBe('backup-2026-11-15.json');
    expect(stored.body.toString()).not.toMatch(/Putri|Kopi/);
    // Filed under "Spendify backups" / <device id>
    const folder = g.files.get(stored.parents[0]);
    expect(folder.name).toBe(done.deviceId);
    expect(g.files.get(folder.parents[0]).name).toBe('Spendify backups');

    const list = await listCloudBackups(code);
    expect(list.map((f) => f.name)).toEqual(['backup-2026-11-15.json']);
    expect(await restoreCloudBackup(code, list[0].id)).toBe(json);
    // And the owner can open the very same file with the private key
    expect(await decryptWithOwnerKey(stored.body.toString(), owner.privateKeyPem)).toBe(json);
  });

  it('sends big backups in pieces and puts them back together', async () => {
    const code = newRecoveryCode();
    // Random-looking text doesn't compress, so this stays bigger than two pieces after encryption
    const noise = new Uint8Array(4_500_000);
    for (let i = 0; i < noise.length; i += 65536) crypto.getRandomValues(noise.subarray(i, i + 65536));
    const big = JSON.stringify({ receipts: { r: Buffer.from(noise).toString('base64') } });
    const steps = [];
    const done = await cloudBackup({ getJson: async () => big, code, date: '2026-11-15', onProgress: (p) => steps.push(p) });
    expect(done.size).toBeGreaterThan(2 * CHUNK);
    expect(steps.at(-1)).toBe(1);
    const [f] = await listCloudBackups(code);
    expect(await restoreCloudBackup(code, f.id)).toBe(big);
  });

  it('keeps one file per day and only the newest ones', async () => {
    vi.stubEnv('BACKUP_KEEP', '2');
    const code = newRecoveryCode();
    for (const d of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-15']) await cloudBackup({ getJson: async () => backupJson(), code, date: d });
    expect((await listCloudBackups(code)).map((f) => f.name)).toEqual(['backup-2026-11-15.json', 'backup-2026-11-14.json']);
  });

  it('keeps each phone’s backups apart: another code sees nothing and can’t open hers', async () => {
    const hers = newRecoveryCode();
    await cloudBackup({ getJson: async () => backupJson(), code: hers, date: '2026-11-15' });
    const [file] = await listCloudBackups(hers);
    const other = newRecoveryCode();
    const folders = [...g.files.values()].filter((f) => f.folder).length;
    expect(await listCloudBackups(other)).toEqual([]);
    // Looking up an unknown code leaves no trace in the Drive
    expect([...g.files.values()].filter((f) => f.folder).length).toBe(folders);
    await expect(restoreCloudBackup(other, file.id)).rejects.toMatchObject({ code: 'file' });
  });

  it('can be locked to her device only', async () => {
    const hers = newRecoveryCode();
    vi.stubEnv('BACKUP_ALLOWED_DEVICES', await deviceIdFor(hers));
    await cloudBackup({ getJson: async () => backupJson(), code: hers, date: '2026-11-15' });
    await expect(cloudBackup({ getJson: async () => backupJson(), code: newRecoveryCode(), date: '2026-11-15' })).rejects.toMatchObject({ code: 'device' });
  });

  it('says clearly when the server isn’t set up or Google refuses', async () => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', '');
    await expect(cloudBackup({ getJson: async () => backupJson(), code: newRecoveryCode(), date: '2026-11-15' })).rejects.toMatchObject({ code: 'not-configured' });
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'revoked');
    resetBackupCache();
    await expect(cloudBackup({ getJson: async () => backupJson(), code: newRecoveryCode(), date: '2026-11-15' })).rejects.toMatchObject({ code: 'google-auth' });
  });

  it('never forwards uploads anywhere but a Google upload session', async () => {
    const res = await fetch('/api/backup', {
      method: 'POST',
      body: JSON.stringify({ op: 'chunk', deviceId: 'a'.repeat(32), session: 'https://evil.example/steal?upload_id=x', offset: 0, size: 3, data: 'AAAA' }),
    });
    expect(res.status).toBe(400);
    expect(g.tokens.issued).toBe(0);
  });
});

describe('when to back up', () => {
  const H = 3600 * 1000;
  const now = Date.UTC(2026, 10, 16, 12);
  it('runs at least daily, and after changes once 6 hours have passed', () => {
    expect(backupDue(null, now, now)).toBe(false);
    expect(backupDue({ on: false, code: 'x' }, now, now)).toBe(false);
    expect(backupDue({ on: true, code: 'x', lastAt: null }, 0, now)).toBe(true);
    expect(backupDue({ on: true, code: 'x', lastAt: now - 2 * H }, now - H, now)).toBe(false); // changed, but too soon
    expect(backupDue({ on: true, code: 'x', lastAt: now - 7 * H }, now - H, now)).toBe(true); // changed, 7 h ago
    expect(backupDue({ on: true, code: 'x', lastAt: now - 7 * H }, now - 8 * H, now)).toBe(false); // nothing new
    expect(backupDue({ on: true, code: 'x', lastAt: now - 25 * H }, 0, now)).toBe(true); // daily anyway
  });
});
