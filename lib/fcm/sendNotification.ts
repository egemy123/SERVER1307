// lib/fcm/sendNotification.ts
// ACC #7C — FCM notification sender utility
// Import from any server action to trigger push notifications

import type { FCMSendPayload } from '@/app/api/fcm/send/route';

const APP_URL         = process.env.NEXT_PUBLIC_APP_URL!;
const INTERNAL_SECRET = process.env.FCM_INTERNAL_SECRET!;

// ─── Core sender ─────────────────────────────────────────────────────────────

export async function sendNotification(payload: FCMSendPayload): Promise<void> {
  try {
    const res = await fetch(`${APP_URL}/api/fcm/send`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error('[FCM] sendNotification failed:', await res.json().catch(() => ({})));
  } catch (err) {
    // Non-fatal — never crash a server action over a notification
    console.error('[FCM] sendNotification error:', err);
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/** Notify R4/R5 when a member is flagged inactive */
export async function notifyInactiveFlag({
  allianceId,
  memberName,
}: {
  allianceId: string;
  memberName: string;
}) {
  await sendNotification({
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

/** Notify commanders about a transfer request */
export async function notifyTransferRequest({
  commanderIds,
  requesterName,
  allianceId,
  transferId,
}: {
  commanderIds:  string[];
  requesterName: string;
  allianceId:    string;
  transferId:    string;
}) {
  await sendNotification({
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

/** Notify alliance when DSB/Canyon event state changes */
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

  await sendNotification({
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