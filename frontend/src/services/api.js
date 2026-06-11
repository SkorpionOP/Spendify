import axios from 'axios';
import { setCache, getCache, addToOutbox } from './db';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  async (response) => {
    // Cache successful GET requests
    if (response.config.method.toLowerCase() === 'get') {
      try {
        await setCache(response.config.url, response.data);
      } catch (err) {
        console.error('Failed to cache response', err);
      }
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    const isOffline = !navigator.onLine || !error.response;

    if (isOffline && config) {
      const method = config.method.toLowerCase();
      
      // Serve from cache for GET
      if (method === 'get') {
        try {
          const cachedData = await getCache(config.url);
          if (cachedData) {
            console.log(`[Offline] Served ${config.url} from cache`);
            return Promise.resolve({ data: cachedData, status: 200, isOffline: true });
          }
        } catch (err) {
          console.error('Cache retrieval failed', err);
        }
      } 
      // Queue mutations (except auth)
      else if (['post', 'put', 'delete'].includes(method) && !config.url.includes('/auth')) {
        try {
          let parsedData = null;
          if (config.data) {
            try {
              parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
            } catch (e) {
              parsedData = config.data;
            }
          }
          await addToOutbox({
            url: config.url,
            method: method,
            data: parsedData,
          });
          console.log(`[Offline] Queued ${method} to ${config.url}`);
          return Promise.resolve({ 
            data: { message: 'Saved offline. Will sync when connected.', status: 'success' }, 
            status: 200, 
            isOffline: true 
          });
        } catch (err) {
          console.error('Failed to queue offline action', err);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
