// ============================================================
// HELPRO — Service Worker (sw.js)
// Place in the ROOT of helpro-main/ (same level as index.html)
// Version bump here forces browser to re-install the worker
// ============================================================

const SW_VERSION = 'helpro-sw-v1';

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
// ── NOTIFICATION TYPE → ACTION BUTTONS ──
function getNotifActions(type) {
  const map = {
    new_message:      [{ action: 'reply',    title: '💬 Reply'          }],
    hired:            [{ action: 'chat',     title: '💬 Open Chat'      }],
    new_application:  [{ action: 'view',     title: '👀 View'           }],
    vetting_approved: [{ action: 'dashboard',title: '🚀 Go to Dashboard'}],
    vetting_rejected: [{ action: 'resubmit', title: '📤 Resubmit Docs'  }],
    payment_received: [{ action: 'view',     title: '💰 View Payment'   }],
    escrow_released:  [{ action: 'wallet',   title: '💰 View Wallet'    }],
    new_job:          [{ action: 'market',   title: '🔍 View Job'       }],
    new_helper:       [{ action: 'admin',    title: '👤 Review'         }],
  };
  return map[type] || [];
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Helpro', body: event.data ? event.data.text() : 'You have a new notification.' };
  }

  const type    = data.type || 'general';
  const title   = data.title || 'Helpro';
  const options = {
    body:    data.body  || '',
    icon:    '/images/icon-192.png',
    badge:   '/images/icon-badge.png',
    image:   data.image || undefined,   // optional large image (booking photo etc.)
    tag:     type,                       // one active notif per type — replaces previous
    renotify: true,
    silent:  false,
    vibrate: [100, 50, 100, 50, 100],
    timestamp: Date.now(),
    requireInteraction: ['new_message', 'payment_received', 'hired'].includes(type),
    actions: getNotifActions(type),
    data: {
      type,
      url:          data.url          || '/dashboard.html',
      sender_id:    data.sender_id    || null,
      sender_name:  data.sender_name  || null,
      helper_id:    data.helper_id    || null,
      helper_name:  data.helper_name  || null,
      client_id:    data.client_id    || null,
      client_name:  data.client_name  || null,
      job_id:       data.job_id       || null,
      booking_id:   data.booking_id   || null,
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────────────
// Fires when the user taps the notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const d      = event.notification.data || {};
  const action = event.action || 'default';

  // ── Determine target URL from action + type ──
  let targetUrl = '/dashboard.html';

  if (action === 'admin'  || d.type === 'new_helper') targetUrl = '/admin.html';
  if (action === 'market' || d.type === 'new_job')    targetUrl = '/market.html';

  // Chat actions — encode recipient into URL so dashboard opens the right thread
  const isChatAction = action === 'reply' || action === 'chat' ||
    d.type === 'new_message' || d.type === 'hired';

  if (isChatAction && (d.sender_id || d.helper_id || d.client_id)) {
    const rid   = d.sender_id || d.helper_id || d.client_id;
    const rname = encodeURIComponent(d.sender_name || d.helper_name || d.client_name || '');
    const jid   = d.job_id || '';
    targetUrl = `/dashboard.html?openChat=1&recipientId=${rid}&recipientName=${rname}&jobId=${jid}`;
  }

  if (action === 'wallet' || d.type === 'escrow_released' || d.type === 'withdrawal') {
    targetUrl = '/dashboard.html?section=wallet';
  }

  const fullUrl = 'https://www.helpro.co.ke' + targetUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab and navigate
      for (const c of clientList) {
        if (c.url.includes('helpro.co.ke') && 'focus' in c) {
          c.focus();
          return c.navigate(fullUrl);
        }
      }
      // No open tab — open new window
      return clients.openWindow(fullUrl);
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
