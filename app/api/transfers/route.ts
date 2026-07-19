// app/api/transfers/route.ts
import { NextResponse }       from 'next/server'
import { requireAuth }        from '@/lib/firebase/serverAuth'
import { createAdminClient }  from '@/lib/supabase/admin'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createAdminClient()

    let query = supabase
      .from('transfer_requests')
      .select('*')
      .order('requested_at', { ascending: false })

    // Supreme sees all, others see their alliance only
    if (auth.role !== 'supreme' && auth.alliance_id) {
      query = query.eq('to_alliance_id', auth.alliance_id)
    }

    const { data: transfers, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ transfers })
  } catch (err) {
    console.error('[TRANSFERS GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { to_alliance_id } = await req.json()
    if (!to_alliance_id) {
      return NextResponse.json({ error: 'to_alliance_id required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get commander data
    const { data: commander } = await supabase
      .from('commanders')
      .select('uid, name, alliance_id, role')
      .eq('uid', auth.commander_uid)
      .single()

    if (!commander) return NextResponse.json({ error: 'Commander not found' }, { status: 404 })

    // Cannot transfer to same alliance
    if (commander.alliance_id === to_alliance_id) {
      return NextResponse.json({ error: 'Already in this alliance' }, { status: 400 })
    }

    // Check no pending request to same alliance
    const { data: existing } = await supabase
      .from('transfer_requests')
      .select('id')
      .eq('commander_uid', auth.commander_uid)
      .eq('to_alliance_id', to_alliance_id)
      .eq('status', 'pending')
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Pending request already exists' }, { status: 409 })
    }

    // Get current alliance tag
    let fromTag: string | null = null
    if (commander.alliance_id) {
      const { data: fromAlliance } = await supabase
        .from('alliances').select('tag').eq('id', commander.alliance_id).single()
      fromTag = fromAlliance?.tag ?? null
    }

    const { data, error } = await supabase
      .from('transfer_requests')
      .insert({
        commander_uid:     auth.commander_uid,
        commander_name:    commander.name,
        from_alliance_id:  commander.alliance_id,
        from_alliance_tag: fromTag,
        to_alliance_id,
        status:            'pending',
        requested_at:      new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[TRANSFERS POST]', err)
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }
}