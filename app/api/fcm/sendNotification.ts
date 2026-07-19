// src/lib/fcm/sendNotification.ts
// ACC #7C — FCM notification sender
// Import and call from any server action to trigger push notifications

import type { FCMSendPayload } from '@/app/api/fcm/send/route';

const APP_URL      = process.env.NEXT_PUBLIC_APP_URL!;
const INTERNAL_SECRET = process.env.FCM_INTERNAL_SECRET!;

export interface SendNotificationResult {
  ok: boolean;
  sent: number;
  failed: number;
  message?: string;
}

/**
 * Send a push notification to specific commanders or an entire alliance.
 * Call this from server actions — never from client components.
 */
export async function sendNotification(payload: FCMSendPayload): Promise<SendNotificationResult> {
  try {
    const res = await fetch(`${APP_URL}/api/fcm/send`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[FCM] sendNotification failed:', data);
      return { ok: false, sent: 0, failed: 0, message: data?.error ?? 'Send failed' };
    }

    // data.sent / data.failed come straight from app/api/fcm/send/route.ts
    return { ok: true, sent: data.sent ?? 0, failed: data.failed ?? 0, message: data.message };
  } catch (err) {
    // Non-fatal — notification failure should never crash a server action
    console.error('[FCM] sendNotification error:', err);
    return { ok: false, sent: 0, failed: 0, message: 'Request error' };
  }
}

// ─── Convenience wrappers ────────────────────────────────────────────────────

/** Notify R4/R5 of an alliance when a member is flagged inactive */
export async function notifyInactiveFlag({
  allianceId,
  memberName,
}: {
  allianceId: string;
  memberName: string;
}) {
  return sendNotification({
    allianceId,
    notification: {
      title: '⚠️ Inactive Member',
      body:  `${memberName} has been flagged as inactive.`,
    },
    data: {
      type:       'inactive_flag',
      allianceId,
      url:        `/alliance/${allianceId}/members?filter=inactive`,
      tag:        `inactive-${allianceId}`,
    },
  });
}

/** Notify a commander about a transfer request */
export async function notifyTransferRequest({
  commanderIds,
  requesterName,
  allianceId,
  transferId,
}: {
  commanderIds: string[];
  requesterName: string;
  allianceId:   string;
  transferId:   string;
}) {
  return sendNotification({
    commanderIds,
    notification: {
      title: '🔄 Transfer Request',
      body:  `${requesterName} has requested a transfer.`,
    },
    data: {
      type:       'transfer_request',
      allianceId,
      transferId,
      url:        `/alliance/${allianceId}/transfers/${transferId}`,
      tag:        `transfer-${transferId}`,
    },
  });
}

/** Notify all alliance members about a DSB/Canyon event state change */
export async function notifyEventUpdate({
  allianceId,
  eventName,
  newState,
  eventId,
}: {
  allianceId: string;
  eventName:  string;
  newState:   string;
  eventId:    string;
}) {
  const stateLabels: Record<string, string> = {
    registration_open: '📋 Registration is open',
    locked:            '🔒 Registration closed',
    in_progress:       '⚔️ Event is live',
    completed:         '✅ Event complete',
  };

  return sendNotification({
    allianceId,
    notification: {
      title: eventName,
      body:  stateLabels[newState] ?? `Status: ${newState}`,
    },
    data: {
      type:       'event_update',
      allianceId,
      eventId,
      url:        `/alliance/${allianceId}/events/${eventId}`,
      tag:        `event-${eventId}`,
    },
  });
}