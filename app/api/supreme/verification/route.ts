// app/api/supreme/verification/route.ts
import { NextResponse }       from 'next/server'
import { headers }            from 'next/headers'
import { createAdminClient }  from '@/lib/supabase/admin'
import { writeAuditLog }      from '@/lib/utils/audit'

async function isSupreme() {
  const h = await headers()
  return h.get('x-commander-role') === 'supreme'
}

export async function POST(req: Request) {
  if (!await isSupreme()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const {
    action,
    commander_uid,
    alliance_id,
    performed_by_uid,
    performed_by_name,
  } = await req.json()

  if (!action || !commander_uid || !performed_by_uid) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (action === 'verify') {
    await supabase
      .from('commanders')
      .update({ verification_status: 'verified' })
      .eq('uid', commander_uid)

    await supabase
      .from('verification_codes')
      .update({ used: true })
      .eq('commander_uid', commander_uid)

    await writeAuditLog({
      action:               'verification_completed',
      performed_by:         performed_by_uid,
      performed_by_role:    'supreme',
      performed_by_display: performed_by_name ?? 'Supreme',
      target_commander_uid: commander_uid,
      target_alliance_id:   alliance_id,
      metadata:              {},
    })

    return NextResponse.json({ success: true })
  }

  if (action === 'reject') {
    await supabase
      .from('commanders')
      .update({ verification_status: 'rejected' })
      .eq('uid', commander_uid)

    await writeAuditLog({
      action:               'verification_rejected',
      performed_by:         performed_by_uid,
      performed_by_role:    'supreme',
      performed_by_display: performed_by_name ?? 'Supreme',
      target_commander_uid: commander_uid,
      target_alliance_id:   alliance_id,
      metadata:              {},
    })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
