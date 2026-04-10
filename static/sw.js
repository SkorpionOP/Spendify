const CACHE_NAME = 'spendly-cache-v1';
const DB_NAME = 'spendly_offline';
const STORE_NAME = 'sync_queue';

const urlsToCache = [
  '/',
  '/login',
  '/signup',
  '/static/style.css',
  '/manifest.json'
];

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore(STORE_NAME, { autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addQueue(url, formDataArray) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add({ url, formDataArray, time: Date.now() });
        tx.oncomplete = () => resolve();
    });
}

async function getQueue() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

async function clearQueue() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
    });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    if (event.request.method === 'GET') {
        event.respondWith(
            fetch(event.request).then(response => {
                const resClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, resClone);
                });
                return response;
            }).catch(() => {
                return caches.match(event.request).then(res => {
                    return res || new Response("You are offline", {status: 503, statusText: "Service Unavailable"});
                });
            })
        );
    } else if (event.request.method === 'POST') {
        event.respondWith(
            fetch(event.request.clone()).catch(async () => {
                // Read formData from the request
                const formData = await event.request.clone().formData();
                const formDataArray = Array.from(formData.entries());
                await addQueue(event.request.url, formDataArray);
                
                // Construct fallback redirect
                return Response.redirect('/dashboard?alert=Saved+offline!+Will+sync+when+online.', 303);
            })
        );
    }
});

self.addEventListener('sync', event => {
    if (event.tag === 'spendly-sync') {
        event.waitUntil(syncData());
    }
});

// For browsers that don't support Background Sync API, we can also listen to messages
self.addEventListener('message', event => {
    if (event.data === 'syncData') {
        event.waitUntil(syncData());
    }
});

async function syncData() {
    const queue = await getQueue();
    if (!queue || queue.length === 0) return;

    for (const item of queue) {
        try {
            const formData = new FormData();
            for (const [key, val] of item.formDataArray) {
                formData.append(key, val);
            }
            await fetch(item.url, {
                method: 'POST',
                body: formData
            });
        } catch (e) {
            console.error('Sync failed', e);
            throw e; 
        }
    }
    await clearQueue();
}
