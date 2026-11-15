/*
 * Backups in the user's own Google Drive.
 *
 * She signs in with Google (Google Identity Services, in a popup) and the backup file goes straight
 * from this phone to her Drive. Nothing passes through Spendify's server, and there is no client
 * secret: the OAuth client ID below is public by design, like any web app's.
 *
 * Scope: drive.file only. Spendify can see and change just the files it created itself (the
 * "Spendify backups" folder and the backup files in it), nothing else in her Drive.
 *
 * Google gives a browser app a token for about an hour and no way to renew it silently, so every
 * backup starts from a tap: the popup opens and closes by itself once she has agreed before.
 */

export const CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || '177141637405-jbj0hfdu2ab1ih8q1j7bck0g5mt71110.apps.googleusercontent.com';
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'Spendify backups';
export const KEEP = 10; // newest backup files kept in the folder
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** code: offline | popup | cancelled | denied | scope | auth | full | api | failed */
export class DriveError extends Error {
  constructor(code, status = null) {
    super(`drive:${code}`);
    this.code = code;
    this.status = status;
  }
}

/* ---------- signing in ---------- */

let gisPromise = null;
/**
 * Loads Google's sign-in script. Call it when a screen with a Drive button appears, so the tap itself
 * can open the popup straight away (browsers block popups that open after a wait).
 */
export const preloadDrive = () => {
  if (typeof window === 'undefined') return Promise.reject(new DriveError('failed'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new DriveError(navigator.onLine === false ? 'offline' : 'failed'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
};

let cached = null; // { token, expires }

/** An access token for her Drive. Opens Google's popup unless a fresh token is still in memory. */
export const getToken = async ({ hint = '' } = {}) => {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new DriveError('offline');
  await preloadDrive();
  const oauth = window.google.accounts.oauth2;
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ...(hint ? { login_hint: hint } : {}),
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new DriveError('denied'));
        // She can untick the Drive box on Google's screen
        if (!oauth.hasGrantedAllScopes(r, SCOPE)) return reject(new DriveError('scope'));
        cached = { token: r.access_token, expires: Date.now() + (Number(r.expires_in) || 3000) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new DriveError(e?.type === 'popup_closed' ? 'cancelled' : e?.type === 'popup_failed_to_open' ? 'popup' : 'failed')),
    });
    client.requestAccessToken({ prompt: '' });
  });
};

/** Forget the token and take back Spendify's access to her Drive. The backup files stay. */
export const disconnectDrive = () =>
  new Promise((resolve) => {
    const token = cached?.token;
    cached = null;
    if (!token || !window.google?.accounts?.oauth2) return resolve();
    window.google.accounts.oauth2.revoke(token, () => resolve());
  });

/* ---------- Drive API (token in, plain data out; `fetch` can be swapped in tests) ---------- */

const call = async (token, url, init = {}, f = fetch) => {
  let r;
  try {
    r = await f(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  } catch {
    throw new DriveError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed');
  }
  if (r.status === 401) {
    cached = null;
    throw new DriveError('auth', 401);
  }
  if (r.status === 403) {
    const body = await r.text().catch(() => '');
    throw new DriveError(/storageQuotaExceeded/.test(body) ? 'full' : 'api', 403);
  }
  if (!r.ok) throw new DriveError('api', r.status);
  return r;
};

const query = (params) => new URLSearchParams(params).toString();
const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Who is signed in, for "Connected as …". */
export const whoAmI = async (token, f = fetch) => {
  const r = await call(token, `${API}/about?${query({ fields: 'user(emailAddress,displayName)' })}`, {}, f);
  const j = await r.json();
  return { email: j?.user?.emailAddress || '', name: j?.user?.displayName || '' };
};

/** The id of the "Spendify backups" folder, created the first time. */
export const ensureFolder = async (token, f = fetch) => {
  const q = `mimeType=${quote(FOLDER_TYPE)} and name=${quote(FOLDER_NAME)} and trashed=false`;
  const found = await (await call(token, `${API}/files?${query({ q, fields: 'files(id)', pageSize: '1', spaces: 'drive' })}`, {}, f)).json();
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await call(
    token,
    `${API}/files?fields=id`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_TYPE }) },
    f
  );
  return (await made.json()).id;
};

/** Backup files in the folder, newest first: [{ id, name, modifiedTime, size }]. */
export const listBackups = async (token, folderId, f = fetch) => {
  const q = `${quote(folderId)} in parents and name contains 'spendify-backup-' and trashed=false`;
  const r = await call(token, `${API}/files?${query({ q, fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '50', spaces: 'drive' })}`, {}, f);
  return ((await r.json()).files || []).map((x) => ({ id: x.id, name: x.name, modifiedTime: x.modifiedTime, size: Number(x.size) || 0 }));
};

/**
 * Saves the backup under `name`. A file with that name (today's) is replaced, so there is one per day.
 * Uses a resumable upload, which has no size limit that matters here (backups carry receipt photos).
 */
export const uploadBackup = async (token, folderId, name, json, f = fetch) => {
  const existing = (await listBackups(token, folderId, f)).find((x) => x.name === name);
  const start = await call(
    token,
    existing ? `${UPLOAD}/files/${existing.id}?uploadType=resumable&fields=id` : `${UPLOAD}/files?uploadType=resumable&fields=id`,
    {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/json' },
      body: JSON.stringify(existing ? {} : { name, parents: [folderId], mimeType: 'application/json' }),
    },
    f
  );
  const session = start.headers.get('location');
  if (!session) throw new DriveError('api');
  const done = await call(token, session, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json }, f);
  return { id: (await done.json()).id, replaced: !!existing };
};

/** Deletes the oldest backup files beyond the newest `keep`. Returns how many were removed. */
export const pruneBackups = async (token, folderId, keep = KEEP, f = fetch) => {
  const old = (await listBackups(token, folderId, f)).slice(keep);
  for (const x of old) await call(token, `${API}/files/${x.id}`, { method: 'DELETE' }, f);
  return old.length;
};

/** The text of one backup file. */
export const downloadBackup = async (token, fileId, f = fetch) => (await call(token, `${API}/files/${fileId}?alt=media`, {}, f)).text();

/* ---------- what the app calls ---------- */

export const backupName = (isoDate) => `spendify-backup-${isoDate}.json`;

/**
 * Sign in if needed, save today's backup, tidy old ones. Resolves to { email, at }.
 * Signing in comes first, right after her tap (so the popup isn't blocked); the backup text is only
 * built afterwards, by `getJson`.
 */
export const backupToDrive = async ({ getJson, date, hint = '' }) => {
  const token = await getToken({ hint });
  const json = await getJson();
  const folder = await ensureFolder(token);
  await uploadBackup(token, folder, backupName(date), json);
  await pruneBackups(token, folder).catch(() => 0); // tidying up must never fail a good backup
  const who = await whoAmI(token).catch(() => ({ email: hint }));
  return { email: who.email || hint, at: Date.now() };
};

/** The backup files in her Drive, newest first. */
export const driveBackups = async ({ hint = '' } = {}) => {
  const token = await getToken({ hint });
  return (await listBackups(token, await ensureFolder(token))).slice(0, KEEP);
};

export const fetchDriveBackup = async (id, { hint = '' } = {}) => downloadBackup(await getToken({ hint }), id);
