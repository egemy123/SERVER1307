// app/api/canyon/roster/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { writeAuditLog }         from '@/lib/utils/audit'

export async function POST(req: Request) {
  try {
    const { event_id, commander_uid, task_force, roster_role } = await req.json()
    if (!event_id || !commander_uid || !task_force || !roster_role) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: event } = await supabase
      .from('canyon_events').select('alliance_id, tfa_finalized, tfb_finalized').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (task_force === 'A' && event.tfa_finalized) return NextResponse.json({ error: 'TF-A finalized' }, { status: 409 })
    if (task_force === 'B' && event.tfb_finalized) return NextResponse.json({ error: 'TF-B finalized' }, { status: 409 })

    // Check not already assigned to any TF
    const { data: existing } = await supabase
      .from('event_roster').select('task_force')
      .eq('event_id', event_id).eq('event_type', 'canyon').eq('commander_uid', commander_uid).single()
    if (existing) return NextResponse.json({ error: `Already in TF-${existing.task_force}` }, { status: 409 })

    // Check limits
    const { data: current } = await supabase
      .from('event_roster').select('roster_role')
      .eq('event_id', event_id).eq('event_type', 'canyon').eq('task_force', task_force)
    const starters = (current ?? []).filter(r => r.roster_role === 'starter').length
    const subs     = (current ?? []).filter(r => r.roster_role === 'substitute').length

    if (roster_role === 'starter'    && starters >= 20) return NextResponse.json({ error: 'Max 20 starters' }, { status: 400 })
    if (roster_role === 'substitute' && subs     >= 10) return NextResponse.json({ error: 'Max 10 substitutes' }, { status: 400 })

    const { error } = await supabase.from('event_roster').insert({
      event_id, event_type: 'canyon', commander_uid,
      task_force, roster_role,
      added_by: auth.commander_uid, added_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action: 'canyon_team_updated', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: event.alliance_id,
      metadata: { event_id, commander_uid, task_force, roster_role, action: 'added' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[CANYON ROSTER POST]', err)
    return NextResponse.json({ error: 'Failed to add' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { event_id, commander_uid } = await req.json()
    if (!event_id || !commander_uid) return NextResponse.json({ error: 'Fields required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: event } = await supabase
      .from('canyon_events').select('alliance_id').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('event_roster').delete()
      .eq('event_id', event_id).eq('event_type', 'canyon').eq('commander_uid', commander_uid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[CANYON ROSTER DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 })
  }
}