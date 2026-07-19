// app/api/transfers/approve/route.ts
import { NextResponse }       from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }  from '@/lib/supabase/admin'
import { writeAuditLog }      from '@/lib/utils/audit'

export async function POST(req: Request) {
  try {
    const { transfer_id } = await req.json()
    if (!transfer_id) return NextResponse.json({ error: 'transfer_id required' }, { status: 400 })

    const supabase = createAdminClient()

    // Get transfer details first
    const { data: transfer, error: tErr } = await supabase
      .from('transfer_requests')
      .select('*')
      .eq('id', transfer_id)
      .single()

    if (tErr || !transfer) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    if (transfer.status !== 'pending') return NextResponse.json({ error: 'Transfer already processed' }, { status: 400 })

    // Verify auth — must be R4+ of the destination alliance
    const auth = await requireAllianceAccess(transfer.to_alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date().toISOString()

    // Update transfer status
    await supabase
      .from('transfer_requests')
      .update({ status: 'approved', reviewed_by: auth.commander_uid, reviewed_at: now })
      .eq('id', transfer_id)

    // Get destination alliance tag
    const { data: toAlliance } = await supabase
      .from('alliances').select('tag').eq('id', transfer.to_alliance_id).single()

    // Close old alliance history entry
    if (transfer.from_alliance_id) {
      await supabase
        .from('alliance_history')
        .update({ left_at: now })
        .eq('commander_uid', transfer.commander_uid)
        .eq('alliance_id', transfer.from_alliance_id)
        .is('left_at', null)
    }

    // Get commander current role
    const { data: commander } = await supabase
      .from('commanders').select('role').eq('uid', transfer.commander_uid).single()

    // Move commander to new alliance
    await supabase
      .from('commanders')
      .update({
        alliance_id: transfer.to_alliance_id,
        status:      'active',
        updated_at:  now,
      })
      .eq('uid', transfer.commander_uid)

    // Create new alliance history entry
    await supabase.from('alliance_history').insert({
      commander_uid: transfer.commander_uid,
      alliance_id:   transfer.to_alliance_id,
      alliance_tag:  toAlliance?.tag ?? '',
      role:          commander?.role ?? 'r1',
      joined_at:     now,
    })

    await writeAuditLog({
      action:               'transfer_approved',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_commander_uid: transfer.commander_uid,
      target_alliance_id:   transfer.to_alliance_id,
      metadata: { transfer_id, from: transfer.from_alliance_id, to: transfer.to_alliance_id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[TRANSFER APPROVE]', err)
    return NextResponse.json({ error: 'Failed to approve' }, { status: 500 })
  }
}