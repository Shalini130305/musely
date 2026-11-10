/**
 * MUSELY Service Worker for Web Push & Mobile Notifications
 * Supports Android, Desktop (Chrome/Firefox/Edge/Safari), and iOS PWA (16.4+)
 */

self.addEventListener('install', (event) => {
  // Activate worker immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let data = {
    title: 'MUSELY',
    body: 'You have a new update',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/notifications',
    tag: 'musely-notification',
  };

  try {
    const json = event.data.json();
    data = { ...data, ...json };
  } catch {
    data.body = event.data.text();
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'musely-notification',
    data: {
      url: data.url || data.data?.url || '/notifications',
      ...(data.data || {}),
    },
    vibrate: [100, 50, 100],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MUSELY', notificationOptions)
  );
});

// Handle notification click action
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a matching MUSELY tab is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // If no tab is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
