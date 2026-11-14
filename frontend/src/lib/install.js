import { useEffect, useState } from 'react';

/*
 * Captures the browser's "install app" prompt as early as possible (it can fire
 * before React mounts), so we can offer our own Install button later.
 */
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

export const initInstallCapture = () => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
};

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const ua = () => navigator.userAgent || '';
export const isIOS = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIOSNonSafari = () => isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua());

/**
 * mode:
 *   'installed' – already running as an app
 *   'prompt'    – we can show the native install dialog (Android / desktop Chrome / Edge)
 *   'ios'       – iPhone/iPad Safari: must use Share → Add to Home Screen
 *   'ios-other' – iPhone in Chrome/Firefox: must open in Safari first (iOS < 16.4) or use Share menu
 *   'manual'    – some other browser: use the browser menu
 */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', l);
    return () => {
      listeners.delete(l);
      mq?.removeEventListener?.('change', l);
    };
  }, []);

  let mode = 'manual';
  if (isStandalone()) mode = 'installed';
  else if (deferred) mode = 'prompt';
  else if (isIOSNonSafari()) mode = 'ios-other';
  else if (isIOS()) mode = 'ios';

  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };

  return { mode, install };
}
