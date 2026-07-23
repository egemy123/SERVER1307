// app/api/alerts/history/route.ts
// Read-only — recent alliance alert sends, for the monitor panel next to
// the Send Alert widget. Anyone who can view the dashboard can view this;
// it's not a sensitive log, just "who called what, when."

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'

const HISTORY_LIMIT = 15

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const allianceId = req.nextUrl.searchParams.get('alliance_id')
    if (!allianceId) return NextResponse.json({ error: 'alliance_id is required' }, { status: 400 })

    if (auth.role !== 'supreme' && auth.alliance_id !== allianceId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, performed_by, performed_by_role, performed_by_display, created_at, metadata')
      .eq('action', 'alliance_alert_sent')
      .eq('target_alliance_id', allianceId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    if (error) {
      console.error('[alerts/history] query failed:', error.message)
      return NextResponse.json({ error: 'Could not load alert history' }, { status: 500 })
    }

    const history = (data ?? []).map(row => ({
      id:           row.id,
      sentBy:       row.performed_by_display,
      sentByRole:   row.performed_by_role,
      sentAt:       row.created_at,
      alertType:    (row.metadata as Record<string, unknown> | null)?.alertType ?? 'custom',
      title:        (row.metadata as Record<string, unknown> | null)?.title ?? null,
      recipients:   (row.metadata as Record<string, unknown> | null)?.sent ?? null,
    }))

    return NextResponse.json({ history })
  } catch (err) {
    console.error('[alerts/history GET]', err)
    return NextResponse.json({ error: 'Failed to fetch alert history' }, { status: 500 })
  }
}