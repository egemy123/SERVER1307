// app/api/dsb/roster/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { writeAuditLog }         from '@/lib/utils/audit'

// POST — add commander to roster
export async function POST(req: Request) {
  try {
    const { event_id, commander_uid, task_force, roster_role } = await req.json()
    if (!event_id || !commander_uid || !task_force || !roster_role) {
      return NextResponse.json({ error: 'All fields required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get event to verify alliance
    const { data: event } = await supabase
      .from('dsb_events').select('alliance_id, tfa_finalized, tfb_finalized').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check TF not finalized
    if (task_force === 'A' && event.tfa_finalized) {
      return NextResponse.json({ error: 'Task Force A is finalized' }, { status: 409 })
    }
    if (task_force === 'B' && event.tfb_finalized) {
      return NextResponse.json({ error: 'Task Force B is finalized' }, { status: 409 })
    }

    // Check commander not already in ANY TF for this event
    const { data: existing } = await supabase
      .from('event_roster')
      .select('id, task_force')
      .eq('event_id', event_id)
      .eq('event_type', 'dsb')
      .eq('commander_uid', commander_uid)
      .single()

    if (existing) {
      return NextResponse.json({
        error: `Commander already assigned to TF-${existing.task_force} for this event`
      }, { status: 409 })
    }

    // Check roster limits
    const { data: current } = await supabase
      .from('event_roster')
      .select('roster_role')
      .eq('event_id', event_id)
      .eq('event_type', 'dsb')
      .eq('task_force', task_force)

    const starterCount = (current ?? []).filter(r => r.roster_role === 'starter').length
    const subCount     = (current ?? []).filter(r => r.roster_role === 'substitute').length

    if (roster_role === 'starter'    && starterCount >= 20) return NextResponse.json({ error: 'Max 20 starters per TF' }, { status: 400 })
    if (roster_role === 'substitute' && subCount     >= 10) return NextResponse.json({ error: 'Max 10 substitutes per TF' }, { status: 400 })

    const { error } = await supabase.from('event_roster').insert({
      event_id, event_type: 'dsb', commander_uid,
      task_force, roster_role,
      added_by: auth.commander_uid,
      added_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action: 'dsb_team_updated', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: event.alliance_id,
      metadata: { event_id, commander_uid, task_force, roster_role, action: 'added' },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DSB ROSTER POST]', err)
    return NextResponse.json({ error: 'Failed to add' }, { status: 500 })
  }
}

// DELETE — remove commander from roster
export async function DELETE(req: Request) {
  try {
    const { event_id, commander_uid } = await req.json()
    if (!event_id || !commander_uid) {
      return NextResponse.json({ error: 'event_id and commander_uid required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: event } = await supabase
      .from('dsb_events').select('alliance_id').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('event_roster')
      .delete()
      .eq('event_id', event_id)
      .eq('event_type', 'dsb')
      .eq('commander_uid', commander_uid)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DSB ROSTER DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 })
  }
}