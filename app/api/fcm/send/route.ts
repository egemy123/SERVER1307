// app/api/fcm/send/route.ts
// ACC #7C — Internal FCM multicast sender
// Protected by x-internal-secret — never call from client

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getMessaging } from 'firebase-admin/messaging'
import { adminApp } from '@/lib/firebase/admin' // requires the one-line export patch
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const INTERNAL_SECRET = process.env.FCM_INTERNAL_SECRET!

// ─── Schema ───────────────────────────────────────────────────────────────────

const SendSchema = z.object({
  commanderIds: z.array(z.string().uuid()).optional(),
  allianceId:   z.string().uuid().optional(),
  notification: z.object({
    title: z.string().max(100),
    body:  z.string().max(300),
  }),
  data: z.object({
    type:       z.enum(['inactive_flag', 'transfer_request', 'event_update', 'general']),
    url:        z.string().optional(),
    allianceId: z.string().optional(),
    transferId: z.string().optional(),
    eventId:    z.string().optional(),
    tag:        z.string().optional(),
  }),
})

export type FCMSendPayload = z.infer<typeof SendSchema>

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = SendSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { commanderIds, allianceId, notification, data } = parsed.data

  // ── Resolve FCM tokens ──────────────────────────────────────────────────────
  let tokens: string[] = []

  if (commanderIds?.length) {
    const { data: rows } = await supabaseAdmin
      .from('commanders')
      .select('fcm_tokens')
      .in('id', commanderIds)
      .not('fcm_tokens', 'is', null)
    tokens = (rows ?? []).flatMap((r) => r.fcm_tokens ?? [])
  } else if (allianceId) {
    const { data: rows } = await supabaseAdmin
      .from('commanders')
      .select('fcm_tokens')
      .eq('alliance_id', allianceId)
      .eq('status', 'active')
      .not('fcm_tokens', 'is', null)
    tokens = (rows ?? []).flatMap((r) => r.fcm_tokens ?? [])
  }

  tokens = [...new Set(tokens)]
  if (!tokens.length) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No tokens found' })
  }

  // ── Send in batches of 500 ──────────────────────────────────────────────────
  const messaging = getMessaging(adminApp)
  let totalSent = 0, totalFailed = 0

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500)

    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: notification.title, body: notification.body },
      data: toStringRecord(data),
      android: {
        priority: 'high',
        notification: { channelId: 'acc_alerts', color: '#7C3AED' },
      },
      apns: {
        payload: { aps: { badge: 1, sound: 'default' } },
      },
      webpush: {
        headers:    { Urgency: 'high' },
        fcmOptions: { link: data.url ?? '/' },
      },
    })

    totalSent   += response.successCount
    totalFailed += response.failureCount

    // Prune stale tokens
    const stale = response.responses
      .map((r, idx) =>
        !r.success && (
          r.error?.code === 'messaging/invalid-registration-token' ||
          r.error?.code === 'messaging/registration-token-not-registered'
        ) ? batch[idx] : null
      )
      .filter(Boolean) as string[]

    if (stale.length) {
      await supabaseAdmin
        .rpc('prune_fcm_tokens', { p_tokens: stale })
        .catch(console.error)
    }
  }

  console.log(`[FCM send] ✓ ${totalSent} sent, ✗ ${totalFailed} failed`)
  return NextResponse.json({ ok: true, sent: totalSent, failed: totalFailed })
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toStringRecord(obj: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  )
}