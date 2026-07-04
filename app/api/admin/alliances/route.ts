// app/api/admin/alliances/route.ts
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = createAdminClient()

    const [{ data: alliances }, { data: commanders }] = await Promise.all([
      supabase.from('alliances').select('*').order('created_at', { ascending: false }),
      supabase.from('commanders').select('uid, name, alliance_id, role').eq('status', 'active').order('name'),
    ])

    return NextResponse.json({ alliances: alliances ?? [], commanders: commanders ?? [] })
  } catch (err) {
    console.error('[ADMIN ALLIANCES GET]', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

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

    if (r5_uid && alliance) {
      await supabase
        .from('commanders')
        .update({ alliance_id: alliance.id, role: 'r5', status: 'active' })
        .eq('uid', r5_uid)

      // Keep alliance_history consistent with every other place a
      // commander's alliance changes (admin Move/Transfer, etc.)
      await supabase.from('alliance_history').insert({
        commander_uid: r5_uid,
        alliance_id:   alliance.id,
        alliance_tag:  alliance.tag,
        role:          'r5',
        joined_at:     new Date().toISOString(),
      })
    }

    await writeAuditLog({
      action: 'alliance_created', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: alliance?.id,
      metadata: { tag, name, r5_uid: r5_uid || null },
    })

    return NextResponse.json({ success: true, alliance })
  } catch (err) {
    console.error('[ADMIN ALLIANCES POST]', err)
    return NextResponse.json({ error: 'Failed to create alliance' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, action, r5_uid } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const supabase = createAdminClient()

    // ── Change R5 ─────────────────────────────────────────────────────────
    if (action === 'change_r5') {
      if (!r5_uid) return NextResponse.json({ error: 'r5_uid required' }, { status: 400 })

      // Demote current R5 to r4
      const { data: currentR5 } = await supabase
        .from('commanders')
        .select('uid, name')
        .eq('alliance_id', id)
        .eq('role', 'r5')
        .single()

      if (currentR5) {
        await supabase
          .from('commanders')
          .update({ role: 'r4' })
          .eq('uid', currentR5.uid)
      }

      // Promote new R5
      await supabase
        .from('commanders')
        .update({ role: 'r5', alliance_id: id, status: 'active' })
        .eq('uid', r5_uid)

      // Update alliance record
      await supabase
        .from('alliances')
        .update({ r5_uid })
        .eq('id', id)

      await writeAuditLog({
        action: 'role_changed', performed_by: auth.commander_uid,
        performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
        target_alliance_id: id,
        metadata: {
          previous_r5: currentR5?.uid ?? null,
          previous_r5_name: currentR5?.name ?? null,
          new_r5: r5_uid,
          demoted_to: 'r4',
        },
      })

      return NextResponse.json({ success: true })
    }

    // ── Disband alliance ──────────────────────────────────────────────────
    if (action === 'disband') {
      const now = new Date().toISOString()

      // Get all active members
      const { data: members } = await supabase
        .from('commanders')
        .select('uid')
        .eq('alliance_id', id)
        .eq('status', 'active')

      // Close all open alliance_history entries
      await supabase
        .from('alliance_history')
        .update({ left_at: now })
        .eq('alliance_id', id)
        .is('left_at', null)

      // Unassign all members — set to unassigned, keep their data
      if (members && members.length > 0) {
        await supabase
          .from('commanders')
          .update({ alliance_id: null, status: 'unassigned', role: 'r1' })
          .eq('alliance_id', id)
      }

      // Mark alliance inactive
      await supabase
        .from('alliances')
        .update({ status: 'inactive', r5_uid: null })
        .eq('id', id)

      await writeAuditLog({
        action: 'alliance_updated', performed_by: auth.commander_uid,
        performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
        target_alliance_id: id,
        metadata: { action: 'disbanded', members_unassigned: members?.length ?? 0 },
      })

      return NextResponse.json({ success: true })
    }

    // ── Generic update ────────────────────────────────────────────────────
    const { error } = await supabase
      .from('alliances').update({ r5_uid, updated_at: new Date().toISOString() }).eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action: 'alliance_updated', performed_by: auth.commander_uid,
      performed_by_role: auth.role as any, performed_by_display: auth.commander_name,
      target_alliance_id: id, metadata: { r5_uid },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ADMIN ALLIANCES PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}