// app/api/admin/alliances/route.ts
import { NextResponse }   from 'next/server'
import { requireAuth }    from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }  from '@/lib/utils/audit'

// GET — fetch all alliances + all commanders (for R5 selector)
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = createAdminClient()

    const [{ data: alliances }, { data: commanders }] = await Promise.all([
      supabase.from('alliances').select('*').order('created_at', { ascending: false }),
      supabase.from('commanders').select('uid, name').eq('status', 'active').order('name'),
    ])

    return NextResponse.json({ alliances: alliances ?? [], commanders: commanders ?? [] })
  } catch (err) {
    console.error('[ADMIN ALLIANCES GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST — create new alliance
export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { tag, name, r5_uid } = await req.json()
    if (!tag?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'Tag and name are required' }, { status: 400 })
    }
    if (tag.length > 5) {
      return NextResponse.json({ error: 'Tag must be 5 characters or less' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Check tag uniqueness
    const { data: existing } = await supabase
      .from('alliances').select('id').eq('tag', tag.toUpperCase()).single()
    if (existing) {
      return NextResponse.json({ error: `Tag [${tag}] already exists` }, { status: 409 })
    }

    const { data: alliance, error } = await supabase
      .from('alliances')
      .insert({
        tag:                tag.trim().toUpperCase(),
        name:               name.trim(),
        r5_uid:             r5_uid || null,
        status:             'active',
        created_by_supreme: auth.commander_uid,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // If R5 assigned, update commander's alliance_id and role
    if (r5_uid && alliance) {
      await supabase
        .from('commanders')
        .update({ alliance_id: alliance.id, role: 'r5', status: 'active' })
        .eq('uid', r5_uid)
    }

    await writeAuditLog({
      action:               'alliance_created',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_alliance_id:   alliance?.id,
      metadata:             { tag, name, r5_uid: r5_uid || null },
    })

    return NextResponse.json({ success: true, alliance })
  } catch (err) {
    console.error('[ADMIN ALLIANCES POST]', err)
    return NextResponse.json({ error: 'Failed to create alliance' }, { status: 500 })
  }
}

// PATCH — update alliance (status, name, r5)
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, ...updates } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('alliances').update(updates).eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action:               'alliance_updated',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_alliance_id:   id,
      metadata:             updates,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ADMIN ALLIANCES PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}