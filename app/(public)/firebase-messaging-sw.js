// public/firebase-messaging-sw.js
//
// Required by hooks/useFCM.ts — navigator.serviceWorker.register('/firebase-messaging-sw.js')
// will 404 without this file, which silently breaks token registration
// (getToken() fails, saveToken() never runs, and "Delivered to 0 Members"
// happens even for users who granted notification permission).
//
// This file is served as a static asset — Next.js does NOT substitute
// process.env values into it at build time. The values below are your
// Firebase Web SDK config (apiKey, authDomain, etc.) — these are public,
// client-exposed values by design (the same ones already baked into your
// browser bundle via NEXT_PUBLIC_* vars), not secrets, so hardcoding them
// here is standard practice for Firebase Cloud Messaging service workers.
//
// Fill in the same values you already have in lib/firebase/client.ts / your
// NEXT_PUBLIC_FIREBASE_* env vars.

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'REPLACE_WITH_NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain:        'REPLACE_WITH_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId:         'REPLACE_WITH_NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  messagingSenderId: 'REPLACE_WITH_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId:             'REPLACE_WITH_NEXT_PUBLIC_FIREBASE_APP_ID',
});

const messaging = firebase.messaging();

// Background handler — fires when the app/tab is NOT in focus. Foreground
// notifications (tab open and active) are handled instead by onMessage()
// inside hooks/useFCM.ts; this is specifically the closed/backgrounded case.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'ACC Alert';
  const body  = payload.notification?.body ?? '';
  const url   = payload.data?.url ?? '/';

  self.registration.showNotification(title, {
    body,
    icon: '/next.svg', // swap for a real app icon if you have one
    data: { url },
    tag:  payload.data?.tag ?? undefined,
  });
});

// Tapping the notification opens (or focuses) the ACC tab at the target URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});