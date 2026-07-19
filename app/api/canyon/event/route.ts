// app/api/canyon/event/route.ts
import { NextResponse }   from 'next/server'
import { requireAuth }    from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey, getWeekStart } from '@/lib/utils/utc2'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const allianceId = searchParams.get('alliance_id')
    if (!allianceId) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    const supabase = createAdminClient()
    const weekKey  = getWeekKey()

    const [{ data: event }, { data: members }] = await Promise.all([
      supabase.from('canyon_events').select('*').eq('alliance_id', allianceId).eq('week_key', weekKey).single(),
      supabase.from('commanders').select('uid, name').eq('alliance_id', allianceId).eq('status', 'active').order('name'),
    ])

    let roster: any[] = []
    if (event) {
      const { data } = await supabase
        .from('event_roster').select('commander_uid, task_force, roster_role')
        .eq('event_id', event.id).eq('event_type', 'canyon')
      roster = data ?? []
    }

    // Auto-create event for R4+ if not exists
    if (!event && ['r4','r5','supreme'].includes(auth.role)) {
      const weekStart = getWeekStart()
      const { data: created } = await supabase
        .from('canyon_events')
        .insert({
          alliance_id: allianceId, week_key: weekKey,
          week_start: weekStart.toISOString(),
          state: 'registration_open', registration_enabled: true,
          created_by: auth.commander_uid,
        })
        .select().single()
      return NextResponse.json({ event: created, members, roster: [] })
    }

    return NextResponse.json({ event, members, roster })
  } catch (err) {
    console.error('[CANYON EVENT GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}