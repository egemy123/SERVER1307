// app/api/alliance/rename/route.ts
//
// Renames an alliance's tag and/or display name.
// R5 can rename only their OWN alliance. Supreme can rename any.
// R4 and below cannot rename (they CAN still edit gift level / targets via
// /api/alliance/settings — renaming is deliberately a higher bar).
import { NextResponse }      from 'next/server'
import { requireAuth }       from '@/lib/firebase/serverAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog }     from '@/lib/utils/audit'

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!['r5', 'supreme'].includes(auth.role)) {
      return NextResponse.json({ error: 'Only R5 or Supreme can rename an alliance' }, { status: 403 })
    }

    const { alliance_id, tag, name } = await req.json()
    if (!alliance_id) return NextResponse.json({ error: 'alliance_id required' }, { status: 400 })

    // R5 can only rename their own alliance
    if (auth.role !== 'supreme' && auth.alliance_id !== alliance_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (tag === undefined && name === undefined) {
      return NextResponse.json({ error: 'Provide tag and/or name' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: current } = await supabase
      .from('alliances')
      .select('id, tag, name')
      .eq('id', alliance_id)
      .single()

    if (!current) return NextResponse.json({ error: 'Alliance not found' }, { status: 404 })

    const updates: Record<string, string> = {}

    if (tag !== undefined) {
      const cleanTag = String(tag).trim().toUpperCase()
      if (!cleanTag) return NextResponse.json({ error: 'Tag cannot be empty' }, { status: 400 })
      if (cleanTag.length > 5) return NextResponse.json({ error: 'Tag must be 5 characters or less' }, { status: 400 })

      if (cleanTag !== current.tag) {
        const { data: clash } = await supabase
          .from('alliances')
          .select('id')
          .eq('tag', cleanTag)
          .neq('id', alliance_id)
          .single()
        if (clash) return NextResponse.json({ error: `Tag [${cleanTag}] is already taken` }, { status: 409 })
      }

      updates.tag = cleanTag
    }

    if (name !== undefined) {
      const cleanName = String(name).trim()
      if (!cleanName) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      updates.name = cleanName
    }

    const { error } = await supabase
      .from('alliances')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', alliance_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog({
      action:               'alliance_renamed' as any,
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_alliance_id:   alliance_id,
      metadata: {
        old_tag:  current.tag,
        new_tag:  updates.tag  ?? current.tag,
        old_name: current.name,
        new_name: updates.name ?? current.name,
      },
    })

    return NextResponse.json({ success: true, tag: updates.tag ?? current.tag, name: updates.name ?? current.name })
  } catch (err) {
    console.error('[ALLIANCE RENAME]', err)
    return NextResponse.json({ error: 'Failed to rename' }, { status: 500 })
  }
}
