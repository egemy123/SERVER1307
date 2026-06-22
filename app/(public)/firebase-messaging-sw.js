// public/firebase-messaging-sw.js
// ACC #7C — Firebase Cloud Messaging Service Worker
// Must be at the root so it can intercept all push events

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ---------------------------------------------------------------------------
// Firebase config (duplicated here — service workers can't import env vars)
// Replace these with your actual values; they are NOT secret (public config)
// ---------------------------------------------------------------------------
firebase.initializeApp({
  apiKey: "AIzaSyDEYihGnPnK9x4YL54sIWehY-Qu97-A_U8",
  authDomain: "acc-platform-65402.firebaseapp.com",
  projectId: "acc-platform-65402",
  storageBucket: "acc-platform-65402.firebasestorage.app",
  messagingSenderId: "780477334406",
  appId: "1:780477334406:web:46301241acfe0119192207",
  measurementId: "G-CHTY9VW6TV"
};

const messaging = firebase.messaging();

// ---------------------------------------------------------------------------
// Background message handler
// Fires when the app is closed or in the background
// ---------------------------------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const { title, body, icon, badge, data } = payload.notification ?? {};
  const notifData = payload.data ?? {};

  // Build a rich notification
  const notificationTitle = title ?? 'ACC Command Center';
  const notificationOptions = {
    body:    body    ?? 'You have a new update.',
    icon:    icon    ?? '/icons/icon-192x192.png',
    badge:   badge   ?? '/icons/badge-72x72.png',
    tag:     notifData.tag ?? 'acc-default',         // collapses duplicate notifs
    renotify: false,
    data:    {
      url:  notifData.url  ?? '/',
      type: notifData.type ?? 'general',
      ...notifData,
    },
    actions: buildActions(notifData.type),
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ---------------------------------------------------------------------------
// Notification click handler
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data   = event.notification.data ?? {};
  const action = event.action;
  const url    = resolveUrl(data, action);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open, focus and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build action buttons based on notification type
 */
function buildActions(type) {
  switch (type) {
    case 'transfer_request':
      return [
        { action: 'approve', title: '✅ Approve' },
        { action: 'view',    title: '👁 View'    },
      ];
    case 'inactive_flag':
      return [
        { action: 'view', title: '👁 View Member' },
      ];
    case 'event_update':
      return [
        { action: 'view', title: '📋 View Event' },
      ];
    default:
      return [];
  }
}

/**
 * Resolve the URL to navigate to based on notification type and action
 */
function resolveUrl(data, action) {
  const base = self.location.origin;

  if (action === 'approve' && data.transferId) {
    return `${base}/alliance/${data.allianceId}/transfers/${data.transferId}?action=approve`;
  }

  switch (data.type) {
    case 'inactive_flag':
      return data.allianceId
        ? `${base}/alliance/${data.allianceId}/members?filter=inactive`
        : `${base}/dashboard`;
    case 'transfer_request':
      return data.transferId
        ? `${base}/alliance/${data.allianceId}/transfers/${data.transferId}`
        : `${base}/alliance/${data.allianceId}/transfers`;
    case 'event_update':
      return data.eventId
        ? `${base}/alliance/${data.allianceId}/events/${data.eventId}`
        : `${base}/alliance/${data.allianceId}/events`;
    default:
      return data.url ?? `${base}/dashboard`;
  }
}

// ---------------------------------------------------------------------------
// Service worker lifecycle — skip waiting so updates apply immediately
// ---------------------------------------------------------------------------
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));