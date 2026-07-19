// app/api/admin/commanders/route.ts
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'

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

    // Check UID uniqueness — one commander row per game UID
    const { data: existing } = await supabase
      .from('commanders').select('uid').eq('uid', uid.trim()).single()
    if (existing) {
      return NextResponse.json({ error: `Commander UID ${uid} already exists` }, { status: 409 })
    }

    // If assigning R5, ensure no other R5 exists in that alliance
    if (role === 'r5' && alliance_id) {
      const { data: existingR5 } = await supabase
        .from('commanders')
        .select('uid, name')
        .eq('alliance_id', alliance_id)
        .eq('role', 'r5')
        .single()

      if (existingR5) {
        return NextResponse.json(
          { error: `${existingR5.name} is already R5 of this alliance` },
          { status: 409 }
        )
      }
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

    // Create alliance history if assigned
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

// PATCH — update commander (status, role, alliance) or run a named action
export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (auth.role !== 'supreme') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { uid, action, ...updates } = await req.json()
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 })

    const supabase = createAdminClient()

    // Fetch current commander state
    const { data: current } = await supabase
      .from('commanders')
      .select('uid, name, role, alliance_id, linked_google_uid')
      .eq('uid', uid)
      .single()

    if (!current) return NextResponse.json({ error: 'Commander not found' }, { status: 404 })

    // ── ACTION: unlink_google ──────────────────
    // Supreme-only. Removes the Google account link WITHOUT deleting the
    // commander identity, role, alliance history, audit history, or stats.
    // After this, the commander can go through /register again to link a
    // new Google account.
    if (action === 'unlink_google') {
      if (!current.linked_google_uid) {
        return NextResponse.json({ error: 'This commander has no linked Google account' }, { status: 400 })
      }

      const oldGoogleUid = current.linked_google_uid

      const { error } = await supabase
        .from('commanders')
        .update({
          linked_google_uid:   null,
          verification_status: 'verified', // eligible to re-link, identity preserved
          updated_at:          new Date().toISOString(),
        })
        .eq('uid', uid)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Revoke any active sessions tied to the old Google account
      try {
        const { adminAuth } = await import('@/lib/firebase/admin')
        await adminAuth.revokeRefreshTokens(oldGoogleUid)
      } catch {
        // non-fatal — session will still expire naturally
      }

      await writeAuditLog({
        action:               'google_account_unlinked' as any,
        performed_by:         auth.commander_uid,
        performed_by_role:    auth.role as any,
        performed_by_display: auth.commander_name,
        target_commander_uid: uid,
        target_alliance_id:   current.alliance_id,
        metadata: {
          commander_uid:  uid,
          old_google_uid: oldGoogleUid,
          unlinked_by:    'supreme',
        },
      })

      return NextResponse.json({ success: true })
    }

    // Rule 1 — Only one R5 per alliance
    if (updates.role === 'r5') {
      const allianceId = updates.alliance_id ?? current.alliance_id
      if (allianceId) {
        const { data: existingR5 } = await supabase
          .from('commanders')
          .select('uid, name')
          .eq('alliance_id', allianceId)
          .eq('role', 'r5')
          .neq('uid', uid)
          .single()

        if (existingR5) {
          return NextResponse.json(
            { error: `${existingR5.name} is already R5 of this alliance` },
            { status: 409 }
          )
        }
      }
    }

    // Rule 2 — Commander can only be in one alliance
    // If alliance_id is being changed, close the old history entry
    if (updates.alliance_id !== undefined && updates.alliance_id !== current.alliance_id) {
      const now = new Date().toISOString()

      // Close old alliance membership
      if (current.alliance_id) {
        await supabase
          .from('alliance_history')
          .update({ left_at: now })
          .eq('commander_uid', uid)
          .eq('alliance_id', current.alliance_id)
          .is('left_at', null)
      }

      // Open new alliance membership (only if actually moving INTO an alliance,
      // not being unassigned entirely)
      if (updates.alliance_id) {
        const { data: newAlliance } = await supabase
          .from('alliances').select('tag').eq('id', updates.alliance_id).single()

        await supabase.from('alliance_history').insert({
          commander_uid: uid,
          alliance_id:   updates.alliance_id,
          alliance_tag:  newAlliance?.tag ?? '',
          role:          updates.role ?? current.role,
          joined_at:     now,
        })
      }
    }

    const { error } = await supabase
      .from('commanders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('uid', uid)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── Real-time claim sync ────────────────────────────────────────────
    // Firebase custom claims (which middleware turns into x-commander-role /
    // x-alliance-id headers) are normally only set at login. If Supreme
    // changes a commander's role or alliance here, that commander's existing
    // session would otherwise keep showing the OLD role/alliance until they
    // log out and back in. Sync claims immediately so the change is visible
    // the moment their client picks it up (see RoleSyncProvider, which
    // listens for this row changing and force-refreshes their session).
    if (current.linked_google_uid && (updates.role !== undefined || updates.alliance_id !== undefined)) {
      try {
        const { adminAuth } = await import('@/lib/firebase/admin')
        const newAllianceId = updates.alliance_id !== undefined ? updates.alliance_id : current.alliance_id

        let allianceTag: string | null = null
        if (newAllianceId) {
          const { data: allianceRow } = await supabase
            .from('alliances').select('tag').eq('id', newAllianceId).single()
          allianceTag = allianceRow?.tag ?? null
        }

        await adminAuth.setCustomUserClaims(current.linked_google_uid, {
          commander_uid:  uid,
          commander_name: current.name,
          role:           updates.role ?? current.role,
          alliance_id:    newAllianceId,
          alliance_tag:   allianceTag,
        })
      } catch (claimErr) {
        // Non-fatal — the DB is already correct. Worst case, the commander
        // sees the update on their next natural login instead of instantly.
        console.error('[ADMIN COMMANDERS PATCH] claim sync failed:', claimErr)
      }
    }

    const auditAction = updates.status === 'disabled'
      ? 'commander_disabled'
      : updates.status === 'active'
        ? 'commander_enabled'
        : updates.alliance_id !== undefined
          ? 'commander_transferred'
          : updates.role
            ? 'role_changed'
            : 'commander_updated'

    await writeAuditLog({
      action:               auditAction as any,
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_commander_uid: uid,
      target_alliance_id:   updates.alliance_id !== undefined ? updates.alliance_id : current.alliance_id,
      metadata:             { ...updates, previous_role: current.role, previous_alliance: current.alliance_id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[ADMIN COMMANDERS PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
