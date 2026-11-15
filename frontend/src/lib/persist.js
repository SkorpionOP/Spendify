/*
 * Belt-and-braces storage. Every change is written to TWO places:
 *   1. localStorage           (fast, synchronous, read on startup)
 *   2. IndexedDB "current"    (a mirror, used if localStorage is wiped or corrupted)
 * Plus rolling snapshots in IndexedDB:
 *   - one per day, last 14 days
 *   - one taken automatically before any destructive action (restore, delete-all)
 * Nothing in here ever overwrites data with an empty state.
 *
 * Receipt photos live in their own IndexedDB store ("receipts"), keyed by the expense's receiptId,
 * because they are far too big for localStorage. They are never in snapshots; backups include them.
 */

export const LS_KEY = 'spendify:v1';
const DB_NAME = 'spendify';
const DB_VERSION = 2; // 2: receipts store
const DAILY_KEEP = 14;
const MANUAL_KEEP = 10;

let dbPromise = null;
const openDB = () => {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB unavailable'));
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const tx = async (store, mode, fn) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => (out = r));
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

const reqP = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

export const hasData = (s) => !!s && (s.profile || (Array.isArray(s.expenses) && s.expenses.length > 0));

/** Read localStorage. Returns { state, corrupt } — never throws. */
export const readLocal = () => {
  let raw;
  try {
    raw = localStorage.getItem(LS_KEY);
  } catch {
    return { state: null, corrupt: false };
  }
  if (!raw) return { state: null, corrupt: false };
  try {
    return { state: JSON.parse(raw), corrupt: false };
  } catch {
    // Keep the broken copy around instead of losing it
    try {
      localStorage.setItem(`${LS_KEY}:corrupt:${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    return { state: null, corrupt: true };
  }
};

/**
 * Safety rule for every write: never replace newer data with older data (e.g. a
 * stale second tab), and never replace real data with an empty state unless the
 * user explicitly chose "Delete all" (allowEmpty).
 */
const isSafeOverwrite = (existing, next, allowEmpty) => {
  if (!existing) return true;
  if ((existing.savedAt || 0) > (next.savedAt || 0)) return false;
  if (hasData(existing) && !hasData(next) && !allowEmpty) return false;
  return true;
};

export const writeLocal = (state, { allowEmpty = false } = {}) => {
  try {
    const { state: existing } = readLocal();
    if (!isSafeOverwrite(existing, state, allowEmpty)) return false;
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('[spendify] localStorage write failed', e);
    return false;
  }
};

export const readMirror = async () => {
  try {
    return await tx('kv', 'readonly', (s) => reqP(s.get('current')));
  } catch {
    return null;
  }
};

export const writeMirror = async (state, { allowEmpty = false } = {}) => {
  try {
    const existing = await readMirror();
    if (!isSafeOverwrite(existing, state, allowEmpty)) return;
    await tx('kv', 'readwrite', (s) => s.put(state, 'current'));
    await maybeDailySnapshot(state);
  } catch (e) {
    console.error('[spendify] IndexedDB write failed', e);
  }
};

/* ---------- snapshots ---------- */

const todayKey = () => new Date().toISOString().slice(0, 10);

const maybeDailySnapshot = async (state) => {
  if (!hasData(state)) return;
  const id = `daily-${todayKey()}`;
  await tx('snapshots', 'readwrite', (s) =>
    s.put({ id, kind: 'daily', at: Date.now(), count: state.expenses.length, state })
  );
  await prune();
};

export const takeSnapshot = async (state, reason) => {
  if (!hasData(state)) return;
  try {
    await tx('snapshots', 'readwrite', (s) =>
      s.put({ id: `manual-${Date.now()}`, kind: 'manual', reason, at: Date.now(), count: state.expenses.length, state })
    );
    await prune();
  } catch (e) {
    console.error('[spendify] snapshot failed', e);
  }
};

const prune = async () => {
  const all = await listSnapshots();
  const drop = [
    ...all.filter((x) => x.kind === 'daily').slice(DAILY_KEEP),
    ...all.filter((x) => x.kind === 'manual').slice(MANUAL_KEEP),
  ];
  if (drop.length) await tx('snapshots', 'readwrite', (s) => drop.forEach((d) => s.delete(d.id)));
};

/** Newest first, without the heavy state payload. */
export const listSnapshots = async () => {
  try {
    const all = await tx('snapshots', 'readonly', (s) => reqP(s.getAll()));
    return all.sort((a, b) => b.at - a.at).map(({ id, kind, reason, at, count }) => ({ id, kind, reason, at, count }));
  } catch {
    return [];
  }
};

export const getSnapshot = async (id) => {
  const snap = await tx('snapshots', 'readonly', (s) => reqP(s.get(id)));
  return snap?.state || null;
};

/* ---------- storage durability ---------- */

export const requestPersistence = async () => {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
};

export const isPersisted = async () => {
  try {
    return (await navigator.storage?.persisted?.()) || false;
  } catch {
    return false;
  }
};

/* ---------- receipt photos ---------- */

/** Saves a photo (a Blob) under `id`. Throws if storage is unavailable or full. */
export const saveReceipt = (id, blob) => tx('receipts', 'readwrite', (s) => s.put({ id, blob, type: blob.type || 'image/jpeg', at: Date.now() }));

/** The photo's Blob, or null. Never throws. */
export const getReceipt = async (id) => {
  if (!id) return null;
  try {
    const row = await tx('receipts', 'readonly', (s) => reqP(s.get(id)));
    return row?.blob || null;
  } catch {
    return null;
  }
};

export const deleteReceipt = async (id) => {
  try {
    await tx('receipts', 'readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
};

/** Every stored photo: [{ id, blob, at }]. */
export const allReceipts = async () => {
  try {
    return await tx('receipts', 'readonly', (s) => reqP(s.getAll()));
  } catch {
    return [];
  }
};

const ORPHAN_KEEP_MS = 30 * 864e5;

/**
 * Removes photos no expense points to any more. A photo is kept for 30 days after it was saved, so
 * "Undo", restoring an earlier copy or a recent snapshot can still find it.
 */
export const pruneReceipts = async (state, now = Date.now()) => {
  const used = new Set((state?.expenses || []).map((e) => e.receiptId).filter(Boolean));
  const old = (await allReceipts()).filter((r) => !used.has(r.id) && now - (r.at || 0) > ORPHAN_KEEP_MS);
  if (!old.length) return 0;
  try {
    await tx('receipts', 'readwrite', (s) => old.forEach((r) => s.delete(r.id)));
  } catch {
    return 0;
  }
  return old.length;
};
