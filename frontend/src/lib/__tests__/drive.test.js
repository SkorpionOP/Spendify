import { describe, expect, it } from 'vitest';
import { DriveError, FOLDER_NAME, SCOPE, backupName, downloadBackup, ensureFolder, listBackups, pruneBackups, uploadBackup, whoAmI } from '../drive';

/* A tiny in-memory Google Drive that answers the requests lib/drive.js makes. */
const fakeDrive = () => {
  const files = new Map(); // id → { id, name, mimeType, parents, body, modifiedTime, size }
  let n = 0;
  let clock = Date.UTC(2026, 10, 1);
  const calls = [];
  const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers });
  const sessions = new Map();

  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, auth: init.headers?.authorization });
    if (init.headers?.authorization !== 'Bearer tok') return json({ error: 'unauthorized' }, 401);

    if (u.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'putri@example.com', displayName: 'Putri' } });

    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q');
      let out = [...files.values()];
      if (q.includes('mimeType=')) out = out.filter((f) => f.mimeType.includes('folder') && q.includes(`name='${f.name}'`));
      else {
        const parent = /^'([^']+)' in parents/.exec(q)[1];
        out = out.filter((f) => f.parents?.includes(parent) && f.name.includes('spendify-backup-')).sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1));
      }
      return json({ files: out.map(({ id, name, modifiedTime, size }) => ({ id, name, modifiedTime, size: String(size) })) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(init.body);
      const id = `f${++n}`;
      files.set(id, { id, ...meta, body: '', size: 0, modifiedTime: new Date((clock += 1000)).toISOString() });
      return json({ id });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files') && (method === 'POST' || method === 'PATCH')) {
      const id = method === 'PATCH' ? u.pathname.split('/').pop() : `f${++n}`;
      const key = `https://www.googleapis.com/upload/session/${id}-${sessions.size}`;
      sessions.set(key, { id, meta: JSON.parse(init.body) });
      return json({}, 200, { location: key });
    }
    if (sessions.has(url) && method === 'PUT') {
      const { id, meta } = sessions.get(url);
      const prev = files.get(id) || {};
      files.set(id, { ...prev, ...meta, id, body: init.body, size: init.body.length, modifiedTime: new Date((clock += 1000)).toISOString() });
      return json({ id });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
    if (one && method === 'DELETE') {
      files.delete(one[1]);
      return new Response(null, { status: 204 });
    }
    if (one && u.searchParams.get('alt') === 'media') return new Response(files.get(one[1]).body);
    return json({ error: 'not found' }, 404);
  };
  return { fetch, files, calls };
};

describe('Google Drive backups', () => {
  it('asks only for access to the files Spendify creates', () => {
    expect(SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(backupName('2026-11-15')).toBe('spendify-backup-2026-11-15.json');
  });

  it('creates the folder once and reuses it', async () => {
    const d = fakeDrive();
    const a = await ensureFolder('tok', d.fetch);
    const b = await ensureFolder('tok', d.fetch);
    expect(a).toBe(b);
    expect([...d.files.values()].filter((f) => f.name === FOLDER_NAME)).toHaveLength(1);
  });

  it('saves one backup per day: the same day replaces, a new day adds', async () => {
    const d = fakeDrive();
    const folder = await ensureFolder('tok', d.fetch);
    expect(await uploadBackup('tok', folder, backupName('2026-11-14'), '{"v":1}', d.fetch)).toMatchObject({ replaced: false });
    expect(await uploadBackup('tok', folder, backupName('2026-11-15'), '{"v":2}', d.fetch)).toMatchObject({ replaced: false });
    expect(await uploadBackup('tok', folder, backupName('2026-11-15'), '{"v":3}', d.fetch)).toMatchObject({ replaced: true });
    const list = await listBackups('tok', folder, d.fetch);
    expect(list.map((f) => f.name)).toEqual(['spendify-backup-2026-11-15.json', 'spendify-backup-2026-11-14.json']);
    // What was uploaded is what comes back
    expect(await downloadBackup('tok', list[0].id, d.fetch)).toBe('{"v":3}');
    expect(list[0].size).toBe(7);
  });

  it('keeps only the newest files', async () => {
    const d = fakeDrive();
    const folder = await ensureFolder('tok', d.fetch);
    for (let day = 1; day <= 5; day++) await uploadBackup('tok', folder, backupName(`2026-11-0${day}`), `{"d":${day}}`, d.fetch);
    expect(await pruneBackups('tok', folder, 3, d.fetch)).toBe(2);
    expect((await listBackups('tok', folder, d.fetch)).map((f) => f.name)).toEqual(['spendify-backup-2026-11-05.json', 'spendify-backup-2026-11-04.json', 'spendify-backup-2026-11-03.json']);
  });

  it('reads who is signed in, and sends the token on every request', async () => {
    const d = fakeDrive();
    expect(await whoAmI('tok', d.fetch)).toEqual({ email: 'putri@example.com', name: 'Putri' });
    expect(d.calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  it('turns Google’s errors into plain reasons', async () => {
    const d = fakeDrive();
    await expect(ensureFolder('expired', d.fetch)).rejects.toMatchObject({ code: 'auth' });
    const full = async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }), { status: 403 });
    await expect(ensureFolder('tok', full)).rejects.toMatchObject({ code: 'full' });
    const down = async () => {
      throw new TypeError('network');
    };
    await expect(ensureFolder('tok', down)).rejects.toBeInstanceOf(DriveError);
    const broken = async () => new Response('oops', { status: 500 });
    await expect(ensureFolder('tok', broken)).rejects.toMatchObject({ code: 'api', status: 500 });
  });
});
