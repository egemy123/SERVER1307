// app/api/dsb/finalize/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { writeAuditLog }         from '@/lib/utils/audit'

export async function POST(req: Request) {
  try {
    const { event_id, task_force } = await req.json()
    if (!event_id || !task_force) {
      return NextResponse.json({ error: 'event_id and task_force required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: event } = await supabase
      .from('dsb_events').select('*').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check slot selected
    const slot = task_force === 'A' ? event.tfa_slot : event.tfb_slot
    if (!slot) return NextResponse.json({ error: 'Select a time slot before finalizing' }, { status: 400 })

    // Check roster complete
    const { data: roster } = await supabase
      .from('event_roster')
      .select('roster_role')
      .eq('event_id', event_id)
      .eq('event_type', 'dsb')
      .eq('task_force', task_force)

    const starters = (roster ?? []).filter(r => r.roster_role === 'starter').length
    const subs     = (roster ?? []).filter(r => r.roster_role === 'substitute').length

    if (starters !== 20) return NextResponse.json({ error: `Need 20 starters, have ${starters}` }, { status: 400 })
    if (subs     !== 10) return NextResponse.json({ error: `Need 10 substitutes, have ${subs}` }, { status: 400 })

    const field = task_force === 'A' ? 'tfa_finalized' : 'tfb_finalized'
    const { error } = await supabase
      .from('dsb_events').update({ [field]: true }).eq('id', event_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action: 'dsb_team_updated', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: event.alliance_id,
      metadata: { event_id, task_force, action: 'finalized', slot, starters, subs },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DSB FINALIZE]', err)
    return NextResponse.json({ error: 'Failed to finalize' }, { status: 500 })
  }
}