// app/api/fcm/register/route.ts
// ACC #7C — Save / remove FCM token for the logged-in commander

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { verifyIdToken } from '@/lib/firebase/admin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TokenSchema = z.object({
  token: z.string().min(10).max(512),
})

// ── Resolve commander from Bearer token in Authorization header ───────────────
async function getCommander(req: NextRequest) {
  const idToken = req.headers.get('Authorization')?.replace('Bearer ', '').trim()
  if (!idToken) return null

  const decoded = await verifyIdToken(idToken)
  if (!decoded) return null

  const { data, error } = await supabaseAdmin
    .from('commanders')
    .select('id')
    .eq('firebase_uid', decoded.uid)
    .single()

  if (error || !data) return null
  return data
}

// ── POST — register token ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const commander = await getCommander(req)
  if (!commander) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const parsed = TokenSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const { error } = await supabaseAdmin.rpc('upsert_fcm_token', {
    p_commander_id: commander.id,
    p_token:        parsed.data.token,
  })

  if (error) {
    console.error('[FCM register]', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── DELETE — remove token ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const commander = await getCommander(req)
  if (!commander) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const parsed = TokenSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const { error } = await supabaseAdmin.rpc('remove_fcm_token', {
    p_commander_id: commander.id,
    p_token:        parsed.data.token,
  })

  if (error) {
    console.error('[FCM remove]', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}