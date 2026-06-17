// app/api/dsb/attendance/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { requireAuth }           from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { writeAuditLog }         from '@/lib/utils/audit'
import { getWeekKey }            from '@/lib/utils/utc2'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const allianceId = searchParams.get('alliance_id')
    if (!allianceId) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    const supabase = createAdminClient()
    const weekKey  = getWeekKey()

    const { data: event } = await supabase
      .from('dsb_events').select('id').eq('alliance_id', allianceId).eq('week_key', weekKey).single()

    if (!event) return NextResponse.json({ event_id: null, roster: [], attendance: [] })

    const [{ data: rosterRaw }, { data: attendanceRaw }] = await Promise.all([
      supabase.from('event_roster')
        .select('commander_uid, task_force, roster_role')
        .eq('event_id', event.id).eq('event_type', 'dsb'),
      supabase.from('attendance_records')
        .select('commander_uid, status, remark')
        .eq('event_id', event.id).eq('event_type', 'dsb'),
    ])

    // Enrich roster with names
    const uids = (rosterRaw ?? []).map(r => r.commander_uid)
    const { data: commanders } = await supabase
      .from('commanders').select('uid, name').in('uid', uids)

    const nameMap: Record<string, string> = {}
    for (const c of (commanders ?? [])) nameMap[c.uid] = c.name

    const roster = (rosterRaw ?? []).map(r => ({
      ...r, name: nameMap[r.commander_uid] ?? r.commander_uid,
    }))

    return NextResponse.json({ event_id: event.id, roster, attendance: attendanceRaw ?? [] })
  } catch (err) {
    console.error('[DSB ATTENDANCE GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { event_id, commander_uid, status, remark, task_force } = await req.json()
    if (!event_id || !commander_uid || !status) {
      return NextResponse.json({ error: 'event_id, commander_uid, status required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: event } = await supabase
      .from('dsb_events').select('alliance_id').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('attendance_records')
      .upsert({
        event_id, event_type: 'dsb', commander_uid,
        task_force: task_force ?? 'A',
        status, remark: remark || null,
        recorded_by: auth.commander_uid,
        recorded_at: new Date().toISOString(),
      }, { onConflict: 'event_id,event_type,commander_uid' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action: 'dsb_attendance_recorded', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: event.alliance_id,
      metadata: { event_id, commander_uid, status, task_force },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DSB ATTENDANCE POST]', err)
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 })
  }
}