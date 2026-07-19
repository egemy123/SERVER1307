// app/api/canyon-status/route.ts
//
// Weekly on/off flag for whether Canyon is happening at all this week.
// Any logged-in commander can read it; only Supreme can change it.
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'

// GET /api/canyon-status?week=2026-W27
export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const week = searchParams.get('week')
    if (!week) return NextResponse.json({ error: 'week required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data } = await supabase
      .from('weekly_canyon_status')
      .select('week_key, active, updated_at')
      .eq('week_key', week)
      .single()

    // No row yet for this week = treat as active (see table comment)
    return NextResponse.json({
      week_key: week,
      active:   data?.active ?? true,
      is_set:   !!data,
    })
  } catch (err) {
    console.error('[CANYON STATUS GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// PATCH — Supreme only. Upserts this week's flag.
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { week_key, active } = await req.json()
    if (!week_key || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'week_key and active (boolean) required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('weekly_canyon_status')
      .upsert({
        week_key,
        active,
        updated_by: auth.commander_uid,
        updated_at: new Date().toISOString(),
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action:               'canyon_status_updated' as any,
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      metadata:             { week_key, active },
    })

    return NextResponse.json({ success: true, week_key, active })
  } catch (err) {
    console.error('[CANYON STATUS PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
