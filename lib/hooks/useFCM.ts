// src/hooks/useFCM.ts
// ACC #7C — FCM token registration hook
// Call this once after successful login (inside protected layout)

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getMessaging, getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { firebaseApp } from '@/lib/firebase/client';
import { useToast } from '@/hooks/useToast'; // adjust to your Toast hook

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FCMNotificationPayload {
  title: string;
  body:  string;
  type:  'inactive_flag' | 'transfer_request' | 'event_update' | 'general';
  url?:  string;
  data?: Record<string, string>;
}

interface UseFCMOptions {
  commanderId: string | null;          // null = not logged in yet
  onNotification?: (payload: FCMNotificationPayload) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFCM({ commanderId, onNotification }: UseFCMOptions) {
  const { showToast } = useToast();
  const tokenSavedRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Register token with Supabase via our API route
  // ---------------------------------------------------------------------------
  const saveToken = useCallback(async (token: string) => {
    if (tokenSavedRef.current === token) return; // already saved this token

    try {
      const res = await fetch('/api/fcm/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[FCM] Token save failed:', err);
        return;
      }

      tokenSavedRef.current = token;
      console.log('[FCM] Token registered ✓');
    } catch (err) {
      console.error('[FCM] Token save error:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Delete token from Supabase (call on logout)
  // ---------------------------------------------------------------------------
  const removeToken = useCallback(async () => {
    if (!tokenSavedRef.current) return;
    try {
      await fetch('/api/fcm/register', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenSavedRef.current }),
      });
      tokenSavedRef.current = null;
    } catch (err) {
      console.error('[FCM] Token remove error:', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Main effect — request permission + get token + listen for foreground msgs
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!commanderId) return;

    // Service workers only work on HTTPS or localhost
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[FCM] Service workers not supported');
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        // 1. Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('[FCM] Notification permission denied');
          return;
        }

        // 2. Register service worker
        const registration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js',
          { scope: '/' }
        );
        await navigator.serviceWorker.ready;

        if (cancelled) return;

        // 3. Get FCM token
        const messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, {
          vapidKey:            VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (!token) {
          console.warn('[FCM] No token returned (VAPID key issue?)');
          return;
        }

        if (cancelled) return;

        // 4. Save token to Supabase
        await saveToken(token);

        // 5. Foreground message listener (app is open)
        const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
          const n = payload.notification;
          const d = payload.data ?? {};

          const fcmPayload: FCMNotificationPayload = {
            title: n?.title ?? 'ACC Command Center',
            body:  n?.body  ?? '',
            type:  (d.type as FCMNotificationPayload['type']) ?? 'general',
            url:   d.url,
            data:  d,
          };

          // Show in-app toast for foreground notifications
          showToast({
            title:   fcmPayload.title,
            message: fcmPayload.body,
            type:    'info',
            action:  fcmPayload.url
              ? { label: 'View', href: fcmPayload.url }
              : undefined,
          });

          onNotification?.(fcmPayload);
        });

        unsubscribeRef.current = unsubscribe;
      } catch (err) {
        console.error('[FCM] Init error:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
    };
  }, [commanderId, saveToken, showToast, onNotification]);

  return { removeToken };
}