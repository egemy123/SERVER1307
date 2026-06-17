// app/api/roles/sync/route.ts
import { NextResponse }       from 'next/server'
import { adminAuth }          from '@/lib/firebase/admin'
import { createAdminClient }  from '@/lib/supabase/admin'
import { requireAuth }        from '@/lib/firebase/serverAuth'

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { target_commander_uid } = await req.json()

    if (!target_commander_uid) {
      return NextResponse.json({ error: 'target_commander_uid required' }, { status: 400 })
    }

    // Only Supreme can sync other commanders
    if (auth.role !== 'supreme' && auth.commander_uid !== target_commander_uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createAdminClient()

    const { data: commander, error } = await supabase
      .from('commanders')
      .select('uid, name, role, status, linked_google_uid, alliance_id')
      .eq('uid', target_commander_uid)
      .single()

    if (error || !commander) {
      return NextResponse.json({ error: 'Commander not found' }, { status: 404 })
    }

    if (!commander.linked_google_uid) {
      return NextResponse.json({ error: 'Commander has no linked Google account' }, { status: 400 })
    }

    // If disabled — revoke sessions immediately
    if (commander.status === 'disabled') {
      await adminAuth.revokeRefreshTokens(commander.linked_google_uid)
      return NextResponse.json({ success: true, action: 'sessions_revoked' })
    }

    // Fetch alliance tag
    let allianceTag: string | null = null
    if (commander.alliance_id) {
      const { data: alliance } = await supabase
        .from('alliances')
        .select('tag')
        .eq('id', commander.alliance_id)
        .single()
      allianceTag = alliance?.tag ?? null
    }

    // Update Firebase custom claims
    await adminAuth.setCustomUserClaims(commander.linked_google_uid, {
      commander_uid:  commander.uid,
      commander_name: commander.name,
      role:           commander.role,
      alliance_id:    commander.alliance_id,
      alliance_tag:   allianceTag,
    })

    // Revoke refresh tokens for immediate effect
    await adminAuth.revokeRefreshTokens(commander.linked_google_uid)

    return NextResponse.json({ success: true, action: 'claims_updated' })

  } catch (error) {
    console.error('[ROLES SYNC]', error)
    return NextResponse.json({ error: 'Role sync failed' }, { status: 500 })
  }
}