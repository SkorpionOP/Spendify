// =============================================
//  SPENDLY SERVICE WORKER  –  v5
//  Full offline-first with IndexedDB sync queue
// =============================================

const CACHE_VERSION = 'spendly-v5';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const PAGE_CACHE    = `${CACHE_VERSION}-pages`;
const ALL_CACHES    = [STATIC_CACHE, PAGE_CACHE];

// Pages to pre-cache on install
const PRECACHE_PAGES = [
  '/dashboard',
  '/calendar',
  '/analysis',
  '/history',
  '/setup',
  '/login',
];

// Static assets to pre-cache
const PRECACHE_STATIC = [
  '/static/style.css',
  '/static/pwa.js',
  '/static/icon.svg',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Outfit:wght@400;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
];

// ───────────────────────────────────────────
//  IndexedDB helpers
// ───────────────────────────────────────────
const DB_NAME    = 'spendly_offline_db';
const DB_VERSION = 2;
const QUEUE_STORE = 'sync_queue';
const DATA_STORE  = 'user_data';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function enqueue(url, formDataArray) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.add({ url, formDataArray, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function deleteItem(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function saveUserData(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(DATA_STORE, 'readwrite');
    const store = tx.objectStore(DATA_STORE);
    store.put({ key, value, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ───────────────────────────────────────────
//  Broadcast helpers
// ───────────────────────────────────────────
async function broadcastToClients(msg) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach(c => c.postMessage(msg));
}

// ───────────────────────────────────────────
//  INSTALL – pre-cache everything
// ───────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const [staticCache, pageCache] = await Promise.all([
        caches.open(STATIC_CACHE),
        caches.open(PAGE_CACHE),
      ]);
      // Cache static assets (ignore failures for external CDN in case offline)
      await Promise.allSettled(
        PRECACHE_STATIC.map(url => staticCache.add(url).catch(() => {}))
      );
      // Cache pages
      await Promise.allSettled(
        PRECACHE_PAGES.map(url =>
          fetch(url, { credentials: 'include' })
            .then(r => { if (r.ok || r.status === 302) pageCache.put(url, r); })
            .catch(() => {})
        )
      );
    })()
  );
});

// ───────────────────────────────────────────
//  ACTIVATE – purge old caches
// ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k) && k.startsWith('spendly'))
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ───────────────────────────────────────────
//  FETCH – network-first for pages, cache-first for static
// ───────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET/POST, chrome-extension, non-http
  if (!request.url.startsWith('http')) return;

  // ── POST requests ──────────────────────────
  if (request.method === 'POST') {
    event.respondWith(handlePost(request));
    return;
  }

  // ── GET: Static assets (cache-first) ───────
  if (
    url.pathname.startsWith('/static/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res && res.status === 200) {
            caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // ── GET: App pages (network-first, cache fallback) ──
  if (url.hostname === self.location.hostname) {
    event.respondWith(
      fetch(request, { credentials: 'include' })
        .then(res => {
          // Only cache successful, non-redirected responses
          if (res && res.ok && !res.redirected) {
            const clone = res.clone();
            caches.open(PAGE_CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ||
            caches.match('/dashboard').then(dash =>
              dash ||
              new Response(
                `<!DOCTYPE html><html><head><meta charset="UTF-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Offline – Spendly</title>
                <style>
                  body{background:#02020a;color:#f0f4ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
                  h1{font-size:2rem;margin-bottom:1rem;color:#6366f1}
                  p{color:#94a3b8;margin-bottom:2rem}
                  button{background:#6366f1;color:#fff;border:none;padding:.85rem 2rem;border-radius:12px;font-size:1rem;cursor:pointer}
                </style></head>
                <body>
                  <div>
                    <div style="font-size:4rem;margin-bottom:1rem">📡</div>
                    <h1>You're Offline</h1>
                    <p>Spendly is in offline mode. Your expenses are saved locally<br>and will sync when you reconnect.</p>
                    <button onclick="location.reload()">Try Again</button>
                  </div>
                </body></html>`,
                { status: 200, headers: { 'Content-Type': 'text/html' } }
              )
            )
          )
        )
    );
  }
});

// ───────────────────────────────────────────
//  POST handler – try network, enqueue offline
// ───────────────────────────────────────────
async function handlePost(request) {
  try {
    const res = await fetch(request.clone(), { credentials: 'include' });
    return res;
  } catch {
    // Offline – read formData and queue it
    let formDataArray = [];
    try {
      const fd = await request.clone().formData();
      formDataArray = Array.from(fd.entries());
    } catch {}

    await enqueue(request.url, formDataArray);

    // Notify clients about the new queue item
    broadcastToClients({ type: 'QUEUED', count: (await getQueue()).length });

    // Derive redirect target from the POST URL
    const pathname = new URL(request.url).pathname;
    let redirectTo = '/dashboard?offline=1';
    if (pathname === '/add')          redirectTo = '/dashboard?offline=1&msg=Expense+saved+offline';
    if (pathname === '/add_needs')    redirectTo = '/dashboard?offline=1&msg=Budget+top-up+queued';
    if (pathname === '/add_savings')  redirectTo = '/dashboard?offline=1&msg=Savings+top-up+queued';
    if (pathname === '/edit')         redirectTo = '/dashboard?offline=1&msg=Edit+queued';

    return Response.redirect(redirectTo, 303);
  }
}

// ───────────────────────────────────────────
//  BACKGROUND SYNC
// ───────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'spendly-sync') {
    event.waitUntil(runSync());
  }
});

// ───────────────────────────────────────────
//  MESSAGE handler (manual sync trigger)
// ───────────────────────────────────────────
self.addEventListener('message', async event => {
  if (event.data === 'SYNC_NOW') {
    await runSync();
  }
  if (event.data === 'GET_QUEUE_COUNT') {
    const q = await getQueue();
    event.source && event.source.postMessage({ type: 'QUEUE_COUNT', count: q.length });
  }
});

// ───────────────────────────────────────────
//  Core sync function
// ───────────────────────────────────────────
async function runSync() {
  const queue = await getQueue();
  if (!queue || queue.length === 0) {
    broadcastToClients({ type: 'SYNC_DONE', synced: 0 });
    return;
  }

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const formData = new FormData();
      for (const [k, v] of item.formDataArray) {
        formData.append(k, v);
      }
      const res = await fetch(item.url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (res.ok || res.redirected || res.status === 303) {
        await deleteItem(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
      throw new Error('Sync failed – will retry');
    }
  }

  broadcastToClients({ type: 'SYNC_DONE', synced, failed });

  // Refresh page cache after sync
  const pageCache = await caches.open(PAGE_CACHE);
  await Promise.allSettled(
    PRECACHE_PAGES.map(url =>
      fetch(url, { credentials: 'include' })
        .then(r => { if (r.ok) pageCache.put(url, r); })
        .catch(() => {})
    )
  );
}
