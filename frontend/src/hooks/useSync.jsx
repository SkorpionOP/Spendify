import { useState, useEffect } from 'react';
import { getOutbox, removeFromOutbox } from '../services/db';
import axios from 'axios';
import api from '../services/api';

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const checkPending = async () => {
    try {
      const outbox = await getOutbox();
      setPendingCount(outbox.length);
    } catch (e) {
      console.error(e);
    }
  };

  const syncOutbox = async () => {
    if (!navigator.onLine || isSyncing) return;
    
    try {
      const outbox = await getOutbox();
      if (outbox.length === 0) return;
      
      setIsSyncing(true);
      
      for (const req of outbox) {
        try {
          // Fire the request directly using standard axios to bypass interceptor caching
          await api({
            method: req.method,
            url: req.url,
            data: req.data,
            headers: { 'X-Sync-Retry': 'true' }
          });
          // Remove from outbox on success
          await removeFromOutbox(req.id);
        } catch (err) {
          console.error(`Failed to sync request ${req.id}`, err);
          // If it's a 4xx error (bad request), we should probably delete it so it doesn't block forever
          if (err.response && err.response.status >= 400 && err.response.status < 500) {
            await removeFromOutbox(req.id);
          }
        }
      }
    } finally {
      setIsSyncing(false);
      checkPending();
      // Dispatch a custom event to notify components (like Dashboard) to refresh data
      window.dispatchEvent(new Event('spendly:synced'));
    }
  };

  useEffect(() => {
    checkPending();
    
    const handleOnline = () => {
      setIsOnline(true);
      syncOutbox();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodically check for outbox items if we somehow missed them
    const interval = setInterval(checkPending, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return { isOnline, isSyncing, pendingCount, syncOutbox };
}
