// app/api/transfers/reject/route.ts
import { NextResponse }          from 'next/server'
import { requireAllianceAccess } from '@/lib/firebase/serverAuth'
import { createAdminClient }     from '@/lib/supabase/admin'
import { writeAuditLog }         from '@/lib/utils/audit'

export async function POST(req: Request) {
  try {
    const { transfer_id } = await req.json()
    if (!transfer_id) return NextResponse.json({ error: 'transfer_id required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: transfer, error: tErr } = await supabase
      .from('transfer_requests').select('*').eq('id', transfer_id).single()

    if (tErr || !transfer) return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    if (transfer.status !== 'pending') return NextResponse.json({ error: 'Already processed' }, { status: 400 })

    const auth = await requireAllianceAccess(transfer.to_alliance_id, 'r4')
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await supabase
      .from('transfer_requests')
      .update({
        status:      'rejected',
        reviewed_by: auth.commander_uid,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', transfer_id)

    await writeAuditLog({
      action:               'transfer_rejected',
      performed_by:         auth.commander_uid,
      performed_by_role:    auth.role as any,
      performed_by_display: auth.commander_name,
      target_commander_uid: transfer.commander_uid,
      target_alliance_id:   transfer.to_alliance_id,
      metadata: { transfer_id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[TRANSFER REJECT]', err)
    return NextResponse.json({ error: 'Failed to reject' }, { status: 500 })
  }
}