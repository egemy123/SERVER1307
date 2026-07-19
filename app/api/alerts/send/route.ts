// app/api/alerts/send/route.ts
// Alliance Alert Center — send route.
//
// Flow (matches spec exactly):
//   authenticate -> verify alliance membership -> verify permission
//   -> atomic alliance-wide cooldown check+set (try_send_alliance_alert)
//   -> if blocked, 429 + secondsRemaining
//   -> else build notification (server-authoritative for presets, capped
//      custom text for 'custom') -> send FCM -> audit log -> return result
//
// Cooldown is ALLIANCE-WIDE and role-blind: R4, R5, everyone waits the same
// 60 seconds after any send, per spec. The atomic check happens inside the
// try_send_alliance_alert Postgres function (row-locked), not in this
// route's JS — a plain "read timestamp, compare, then write" here would
// have a race condition if two members tapped Send within the same second.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'
import { sendNotification }  from '@/lib/fcm/sendNotification'
import { can } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types'
import {
  ALERT_PRESET_MAP,
  ALERT_COOLDOWN_SECONDS,
  CUSTOM_MESSAGE_MAX_LENGTH,
  type AlertPresetKey,
} from '@/lib/alerts/presets'

const PRESET_KEYS = ALERT_PRESET_MAP && (Object.keys(ALERT_PRESET_MAP) as AlertPresetKey[])

const SendAlertSchema = z.object({
  allianceId:   z.string().uuid(),
  alertType:    z.enum(PRESET_KEYS as [AlertPresetKey, ...AlertPresetKey[]]),
  customTitle:   z.string().max(60).optional(),
  customMessage: z.string().max(CUSTOM_MESSAGE_MAX_LENGTH).optional(),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = SendAlertSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const { allianceId, alertType, customTitle, customMessage } = parsed.data

    // ── Verify alliance membership ──────────────────────────────────────────
    if (auth.role !== 'supreme' && auth.alliance_id !== allianceId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // ── Verify permission (r1+ — cooldown is the real gate, not role) ──────
    if (!can.sendAllianceAlert(auth.role as Role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (alertType === 'custom') {
      const title = customTitle?.trim()
      const message = customMessage?.trim()
      if (!title || !message) {
        return NextResponse.json(
          { error: 'Custom alerts require both a title and a message' },
          { status: 400 },
        )
      }
    }

    const supabase = createAdminClient()

    // ── Atomic alliance-wide cooldown check + set ───────────────────────────
    const { data: cooldownResult, error: cooldownError } = await supabase.rpc(
      'try_send_alliance_alert',
      { p_alliance_id: allianceId, p_cooldown_seconds: ALERT_COOLDOWN_SECONDS },
    )
    if (cooldownError) {
      console.error('[alerts/send] try_send_alliance_alert failed:', cooldownError.message)
      return NextResponse.json({ error: 'Could not process alert request' }, { status: 500 })
    }

    const row = Array.isArray(cooldownResult) ? cooldownResult[0] : cooldownResult
    if (!row?.allowed) {
      return NextResponse.json(
        {
          error: 'Cooldown active',
          secondsRemaining: row?.seconds_remaining ?? ALERT_COOLDOWN_SECONDS,
        },
        { status: 429 },
      )
    }

    // ── Build notification text — server-authoritative for presets ─────────
    const preset = ALERT_PRESET_MAP[alertType]
    const title = alertType === 'custom' ? `📢 ${customTitle!.trim()}` : `${preset.icon} ${preset.title}`
    const body  = alertType === 'custom' ? customMessage!.trim() : preset.notificationBody

    // ── Send via existing FCM infrastructure ────────────────────────────────
    const result = await sendNotification({
      allianceId,
      notification: { title, body },
      data: {
        type:       'alliance_alert',
        allianceId,
        url:        `/alliance/${allianceId}/alerts`,
        tag:        `alliance-alert-${allianceId}`,
      },
    })

    // ── Audit log ────────────────────────────────────────────────────────────
    await writeAuditLog({
      action:               'alliance_alert_sent',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as Role,
      performed_by_display: auth.commander_name ?? auth.commander_uid,
      target_alliance_id:   allianceId,
      metadata: {
        alertType,
        title,
        body,
        sent:   result?.sent ?? null,
        failed: result?.failed ?? null,
      },
    })

    return NextResponse.json({
      ok: true,
      title,
      body,
      sent:   result?.sent ?? 0,
      failed: result?.failed ?? 0,
    })
  } catch (err) {
    console.error('[alerts/send POST]', err)
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 })
  }
}