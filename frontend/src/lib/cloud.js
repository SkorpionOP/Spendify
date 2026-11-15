/*
 * Automatic encrypted backups to the app owner's Google Drive (through api/backup.js).
 *
 * Nothing leaves the phone unencrypted: the backup is locked here (lib/vault.js) with her recovery
 * code and the owner's public key, then sent in pieces. She never signs in to anything.
 *
 * Configured at build time (Vercel environment variables, then redeploy):
 *   VITE_BACKUP_PUBLIC_KEY   the owner's public key, from scripts/backup-setup.mjs keys
 *   VITE_BACKUP_OWNER_NAME   the name she sees, e.g. "Kiran"
 * Without a public key the feature stays hidden.
 *
 * Her settings: state.settings.cloud
 *   null                                      never asked
 *   { declined: true, askedAt }               she said "not now"
 *   { on, code, deviceId, consentAt, lastAt, lastSize, lastError, failingSince }
 */
import { decryptWithCode, deviceIdFor, encryptBackup, normalizeCode, toB64 } from './vault.js';

const env = import.meta.env || {};
export const OWNER_PUBLIC_KEY = (env.VITE_BACKUP_PUBLIC_KEY || '').trim();
export const OWNER_NAME = (env.VITE_BACKUP_OWNER_NAME || '').trim();
export const cloudAvailable = () => !!OWNER_PUBLIC_KEY;

export const CHUNK = 11 * 256 * 1024; // same as api/backup.js
/** Back up again once the data changed and the last backup is this old. */
export const MIN_GAP = 6 * 3600 * 1000;

export class CloudError extends Error {
  constructor(code, retryAfter = null) {
    super(`cloud:${code}`);
    this.code = code; // offline | limited | not-configured | device | drive-full | wrong-code | damaged | failed …
    this.retryAfter = retryAfter;
  }
}

const post = async (body, timeout = 60000) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CloudError('offline');
  let r;
  try {
    r = await fetch('/api/backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch {
    throw new CloudError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'failed');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new CloudError('limited', j.retryAfter || null);
  if (!r.ok) throw new CloudError(j.error || 'failed');
  return j;
};

/** Should an automatic backup run now? Pure, so it can be tested. */
export const backupDue = (cloud, savedAt, now = Date.now()) => {
  if (!cloud?.on || !cloud.code) return false;
  if (!cloud.lastAt) return true;
  if (now - cloud.lastAt >= 24 * 3600 * 1000) return true; // at least daily
  return (savedAt || 0) > cloud.lastAt && now - cloud.lastAt >= MIN_GAP;
};

/** Encrypts the backup and uploads it. `getJson` builds the backup text (exportData). */
export const cloudBackup = async ({ getJson, code, date, onProgress }) => {
  const deviceId = await deviceIdFor(code);
  const text = await encryptBackup(await getJson(), { code, ownerPublicKey: OWNER_PUBLIC_KEY });
  const bytes = new TextEncoder().encode(text);
  const { session } = await post({ op: 'start', deviceId, date, size: bytes.length });
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const piece = bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK));
    await post({ op: 'chunk', deviceId, session, offset, size: bytes.length, data: toB64(piece) });
    onProgress?.(Math.min(1, (offset + piece.length) / bytes.length));
  }
  return { deviceId, at: Date.now(), size: bytes.length };
};

/** Her backups in the owner's Drive, newest first. Needs only the recovery code. */
export const listCloudBackups = async (code) => {
  if (!normalizeCode(code)) throw new CloudError('wrong-code');
  const { files = [] } = await post({ op: 'list', deviceId: await deviceIdFor(code) });
  return files;
};

/** Downloads one backup and opens it with the code. Resolves to the backup's JSON text. */
export const restoreCloudBackup = async (code, fileId, onProgress) => {
  const deviceId = await deviceIdFor(code);
  const parts = [];
  let offset = 0;
  for (;;) {
    const r = await post({ op: 'get', deviceId, fileId, offset });
    parts.push(Uint8Array.from(atob(r.data || ''), (c) => c.charCodeAt(0)));
    if (r.next == null) break;
    offset = r.next;
    onProgress?.(offset / r.size);
  }
  const text = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
  try {
    return await decryptWithCode(text, code);
  } catch (err) {
    throw new CloudError(err.message === 'wrong-code' ? 'wrong-code' : 'damaged');
  }
};
