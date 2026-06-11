const DB_NAME = 'SpendlyPWA_DB';
const DB_VERSION = 1;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store for caching GET request responses
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'url' });
      }

      // Store for pending POST/PUT/DELETE requests when offline
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

export const setCache = async (url, data) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    const request = store.put({ url, data, timestamp: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getCache = async (url) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['cache'], 'readonly');
    const store = transaction.objectStore('cache');
    const request = store.get(url);

    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => reject(request.error);
  });
};

export const addToOutbox = async (requestConfig) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['outbox'], 'readwrite');
    const store = transaction.objectStore('outbox');
    const request = store.add({
      ...requestConfig,
      timestamp: Date.now()
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getOutbox = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['outbox'], 'readonly');
    const store = transaction.objectStore('outbox');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const removeFromOutbox = async (id) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['outbox'], 'readwrite');
    const store = transaction.objectStore('outbox');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
