// app/api/duel/week/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { requireAuth }           from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { getWeekKey, getWeekStart } from '@/lib/utils/utc2'

// GET — fetch current week data + members + entries
export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const allianceId       = searchParams.get('alliance_id')
    if (!allianceId) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    const supabase = createAdminClient()
    const weekKey  = getWeekKey()

    const [
      { data: week },
      { data: members },
    ] = await Promise.all([
      supabase.from('duel_weeks').select('*').eq('alliance_id', allianceId).eq('week_key', weekKey).single(),
      supabase.from('commanders').select('uid, name, role').eq('alliance_id', allianceId).eq('status', 'active').order('name'),
    ])

    let entries: any[] = []
    let dayResults: any[] = []
    if (week) {
      const [{ data: entryData }, { data: resultData }] = await Promise.all([
        supabase.from('duel_entries').select('*').eq('duel_week_id', week.id),
        supabase.from('duel_day_results').select('*').eq('duel_week_id', week.id),
      ])
      entries    = entryData ?? []
      dayResults = resultData ?? []
    }

    return NextResponse.json({ week, members, entries, day_results: dayResults, viewer_role: auth.role })
  } catch (err) {
    console.error('[DUEL WEEK GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST — create new duel week
export async function POST(req: Request) {
  try {
    const body         = await req.json()
    const { alliance_id, mode } = body

    if (!alliance_id) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    const auth = await requireAllianceAccess(alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase   = createAdminClient()
    const weekKey    = getWeekKey()
    const weekStart  = getWeekStart()

    // Check week doesn't already exist
    const { data: existing } = await supabase
      .from('duel_weeks').select('id').eq('alliance_id', alliance_id).eq('week_key', weekKey).single()

    if (existing) {
      return NextResponse.json({ error: 'Week already exists for this alliance' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('duel_weeks')
      .insert({
        alliance_id,
        week_key:   weekKey,
        week_start: weekStart.toISOString(),
        mode:       mode ?? 'quick',
        created_by: auth.commander_uid,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[DUEL WEEK POST]', err)
    return NextResponse.json({ error: 'Failed to create week' }, { status: 500 })
  }
}