// app/api/canyon/side/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'

// POST — set side
export async function POST(req: Request) {
  try {
    const { event_id, task_force, side } = await req.json()
    if (!event_id || !task_force || !side) return NextResponse.json({ error: 'All fields required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: event } = await supabase
      .from('canyon_events').select('alliance_id, tfa_side_finalized, tfb_side_finalized, tfa_finalized, tfb_finalized').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (task_force === 'A' && (event.tfa_side_finalized || event.tfa_finalized)) {
      return NextResponse.json({ error: 'TF-A side is locked' }, { status: 409 })
    }
    if (task_force === 'B' && (event.tfb_side_finalized || event.tfb_finalized)) {
      return NextResponse.json({ error: 'TF-B side is locked' }, { status: 409 })
    }

    const field = task_force === 'A' ? 'tfa_side' : 'tfb_side'
    const { error } = await supabase.from('canyon_events').update({ [field]: side }).eq('id', event_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[CANYON SIDE POST]', err)
    return NextResponse.json({ error: 'Failed to set side' }, { status: 500 })
  }
}

// PATCH — finalize/lock side (cannot change after this)
export async function PATCH(req: Request) {
  try {
    const { event_id, task_force } = await req.json()
    if (!event_id || !task_force) return NextResponse.json({ error: 'Fields required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: event } = await supabase
      .from('canyon_events').select('alliance_id, tfa_side, tfb_side').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const side = task_force === 'A' ? event.tfa_side : event.tfb_side
    if (!side) return NextResponse.json({ error: 'Select a side before locking' }, { status: 400 })

    const field = task_force === 'A' ? 'tfa_side_finalized' : 'tfb_side_finalized'
    const { error } = await supabase.from('canyon_events').update({ [field]: true }).eq('id', event_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[CANYON SIDE PATCH]', err)
    return NextResponse.json({ error: 'Failed to lock side' }, { status: 500 })
  }
}