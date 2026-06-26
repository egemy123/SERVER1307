// app/api/admin/commanders/route.ts
import { NextResponse }   from 'next/server'
import { requireAuth }    from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }  from '@/lib/utils/audit'

// GET — fetch all commanders + alliances
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = createAdminClient()

    const [{ data: commanders }, { data: alliances }] = await Promise.all([
      supabase
        .from('commanders')
        .select('uid, name, role, status, alliance_id, verification_status, inactive_flagged, linked_google_uid')
        .order('name'),
      supabase
        .from('alliances')
        .select('id, tag, name')
        .eq('status', 'active')
        .order('tag'),
    ])

    return NextResponse.json({ commanders: commanders ?? [], alliances: alliances ?? [] })
  } catch (err) {
    console.error('[ADMIN COMMANDERS GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST — add new commander
export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { uid, name, role, alliance_id, status } = await req.json()
    if (!uid?.trim() || !name?.trim()) {
      return NextResponse.json({ error: 'UID and name are required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Check UID uniqueness
    const { data: existing } = await supabase
      .from('commanders').select('uid').eq('uid', uid.trim()).single()
    if (existing) {
      return NextResponse.json({ error: `Commander UID ${uid} already exists` }, { status: 409 })
    }

    const { data: commander, error } = await supabase
      .from('commanders')
      .insert({
        uid:         uid.trim(),
        name:        name.trim(),
        role:        role ?? 'r1',
        alliance_id: alliance_id || null,
        status:      status ?? (alliance_id ? 'active' : 'unassigned'),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Create alliance history if assigned to alliance
    if (alliance_id && commander) {
      const { data: alliance } = await supabase
        .from('alliances').select('tag').eq('id', alliance_id).single()

      await supabase.from('alliance_history').insert({
        commander_uid: uid.trim(),
        alliance_id,
        alliance_tag:  alliance?.tag ?? '',
        role:          role ?? 'r1',
        joined_at:     new Date().toISOString(),
      })
    }

    await writeAuditLog({
      action:               'commander_created',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_commander_uid: uid.trim(),
      target_alliance_id:   alliance_id || null,
      metadata:             { name, role, alliance_id: alliance_id || null },
    })

    return NextResponse.json({ success: true, commander })
  } catch (err) {
    console.error('[ADMIN COMMANDERS POST]', err)
    return NextResponse.json({ error: 'Failed to add commander' }, { status: 500 })
  }
}

// PATCH — update commander (status, role, alliance)
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { uid, ...updates } = await req.json()
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 })

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('commanders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('uid', uid)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Determine audit action
    const action = updates.status === 'disabled'
      ? 'commander_disabled'
      : updates.status === 'active'
        ? 'commander_enabled'
        : updates.role
          ? 'role_changed'
          : 'commander_updated'

    await writeAuditLog({
      action:               action as any,
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_commander_uid: uid,
      metadata:             updates,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ADMIN COMMANDERS PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}