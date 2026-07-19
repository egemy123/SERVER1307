// app/api/alliance/settings/route.ts
//
// Updates gift level and/or targets for an alliance. Used by the inline
// editors on the dashboard (and can replace the standalone
// /alliance/settings page's server action too, for one source of truth).
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const canEdit = ['r4', 'r5', 'supreme'].includes(auth.role)
    if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { alliance_id, ...updates } = await req.json()
    if (!alliance_id) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    // R4/R5 can only edit their own alliance. Supreme can edit any.
    if (auth.role !== 'supreme' && auth.alliance_id !== alliance_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ALLOWED = new Set([
      'gift_level',
      'target_1', 'target_2', 'target_3', 'target_4', 'target_5',
      'target_1_completed', 'target_2_completed', 'target_3_completed',
      'target_4_completed', 'target_5_completed',
    ])
    const safeUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (ALLOWED.has(key)) safeUpdates[key] = value
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('alliances')
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq('id', alliance_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action:               'alliance_settings_updated' as any,
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_alliance_id:   alliance_id,
      metadata:             safeUpdates,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ALLIANCE SETTINGS PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
