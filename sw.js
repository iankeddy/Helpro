// ============================================================
// HELPRO — Service Worker (sw.js)
// Place in the ROOT of helpro-main/ (same level as index.html)
// Version bump here forces browser to re-install the worker
// ============================================================

const SW_VERSION = 'helpro-sw-v2';

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── PUSH EVENT ───────────────────────────────────────────────
// Fired when a push message arrives from the server,
// even when all browser tabs for Helpro are closed.
self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Helpro', body: event.data ? event.data.text() : 'You have a new notification.' };
  }

  const title   = data.title   || 'Helpro';
  const options = {
    body:    data.body    || '',
    icon:    data.icon    || '/helpro-main/images/icon-192.png',
    badge:   data.badge   || '/helpro-main/images/icon-badge.png',
    tag:     data.tag     || 'helpro-notif',          // replaces previous notif of same tag
    renotify: true,
    data:    data.data    || {},                      // passed to notificationclick
    actions: data.actions || [],
    vibrate: [100, 50, 100],
    timestamp: Date.now(),
    // Show in notification tray even when app is focused
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────────────
// Fires when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  let targetUrl = 'dashboard.html';

  // Route to the right page based on notification type
  if (notifData.type === 'new_helper')  targetUrl = 'admin.html';
  else if (notifData.type === 'new_job') targetUrl = 'admin.html';
  else if (notifData.job_id || notifData.booking_id) targetUrl = 'dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already an open Helpro tab, focus it and navigate
      for (const c of clientList) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.focus();
          c.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── PUSH SUBSCRIPTION CHANGE ─────────────────────────────────
// Browser rotates push subscription keys periodically.
// Re-subscribe automatically and notify the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self._vapidPublicKey   // set by notifications.js via postMessage
    }).then((subscription) => {
      // Tell the main thread to save the new subscription
      return clients.matchAll().then((clientList) => {
        clientList.forEach((c) => {
          c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: subscription.toJSON() });
        });
      });
    }).catch(() => {})
  );
});

// ── MESSAGE HANDLER ──────────────────────────────────────────
// Receives messages from the main thread (e.g. VAPID key for re-subscribe)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_VAPID_KEY') {
    self._vapidPublicKey = event.data.key;
  }
});
