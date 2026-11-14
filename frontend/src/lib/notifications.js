/**
 * Web Notifications helper for Spendify PWA.
 * Enables system notifications for monthly repeats, auto-deductions, and reminders.
 */

export const isNotificationSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window;

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch {
    return false;
  }
};

export const sendNotification = (title, { body, icon = '/icon-192x192.png', tag = 'spendify-repeat', ...rest } = {}) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return null;
  try {
    return new Notification(title, {
      body,
      icon,
      badge: '/icon-192x192.png',
      tag,
      ...rest,
    });
  } catch {
    return null;
  }
};
