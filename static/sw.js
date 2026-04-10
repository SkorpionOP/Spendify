const CACHE_VERSION = 'spendly-v8';
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
  console.log(`[Spendly] Installing v${CACHE_VERSION}`);
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
//  Domains the SW must NEVER touch
//  (Firebase auth, Google OAuth, CDN APIs…)
// ───────────────────────────────────────────
const BYPASS_HOSTS = [
  'googleapis.com',
  'firebaseapp.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
  'firestore.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebasestorage.googleapis.com',
  'graph.facebook.com',
  'api.github.com',
  'cdn.jsdelivr.net',
  'firebase.com',
  'google.com',
  'gstatic.com',
];

// Routes that must never be handled offline (Auth/Security)
const AUTH_ROUTES = ['/login', '/signup', '/auth/firebase', '/logout'];

function shouldBypass(url) {
  if (!url.startsWith('http')) return true;
  try {
    const u = new URL(url);
    const { hostname, pathname } = u;

    // 1. Bypass any external domain that isn't our own
    if (hostname !== self.location.hostname) {
      // Allow specific CDNs to be cached (Fonts, etc.)
      const isCDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'].some(h => hostname === h);
      if (!isCDN) return true;
    }

    // 2. Bypass known auth/API domains
    if (BYPASS_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h))) return true;

    // 3. Bypass Firebase internal routes
    if (pathname.includes('/__/auth/') || pathname.includes('/firebase-')) return true;

    // 4. Bypass app auth routes
    if (AUTH_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) return true;

  } catch (e) {
    return true;
  }
  return false;
}

// ───────────────────────────────────────────
//  FETCH – network-first for pages, cache-first for static
// ───────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Hard bypass – never intercept auth / external requests ──
  if (shouldBypass(request.url)) return;

  // ── POST requests (same-origin app routes only) ─────────────
  if (request.method === 'POST') {
    // Only intercept POST to our own server routes
    if (url.hostname !== self.location.hostname) return;
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
          // If network is up, update cache and return the real response
          if (res && res.ok && !res.redirected) {
            const clone = res.clone();
            caches.open(PAGE_CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => {
          // Network failed – try cache
          return caches.match(request).then(cached => {
            if (cached) return cached;
            
            // If it's a navigational request and we have NO cache, show the minimal offline page
            if (request.mode === 'navigate') {
              return new Response(
                `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline – Spendly</title>
                <style>body{background:#02020a;color:#94a3b8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
                .box{text-align:center;padding:2rem}h1{color:#6366f1;font-size:1.5rem}button{background:#6366f1;color:#fff;border:none;padding:.7rem 1.5rem;border-radius:8px;cursor:pointer;margin-top:1rem}</style></head>
                <body><div class="box"><h1>Connection Lost</h1><p>We'll reconcile your data once you're back online.</p><button onclick="location.reload()">Retry</button></div></body></html>`,
                { status: 200, headers: { 'Content-Type': 'text/html' } }
              );
            }
            return new Response("Offline", { status: 503 });
          });
        })
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
