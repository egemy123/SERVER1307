// app/api/canyon/slot/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { event_id, task_force, slot } = await req.json()
    if (!event_id || !task_force || !slot) return NextResponse.json({ error: 'All fields required' }, { status: 400 })

    const supabase = createAdminClient()
    const { data: event } = await supabase
      .from('canyon_events').select('alliance_id, tfa_finalized, tfb_finalized').eq('id', event_id).single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const auth = await requireAllianceAccess(event.alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (task_force === 'A' && event.tfa_finalized) return NextResponse.json({ error: 'TF-A finalized' }, { status: 409 })
    if (task_force === 'B' && event.tfb_finalized) return NextResponse.json({ error: 'TF-B finalized' }, { status: 409 })

    const field = task_force === 'A' ? 'tfa_slot' : 'tfb_slot'
    const { error } = await supabase.from('canyon_events').update({ [field]: slot }).eq('id', event_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[CANYON SLOT]', err)
    return NextResponse.json({ error: 'Failed to set slot' }, { status: 500 })
  }
}