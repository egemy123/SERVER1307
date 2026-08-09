// app/api/verify/route.ts
// Handles all 3 verification actions server-side
// Clients NEVER read verification codes directly

import { NextResponse }       from 'next/server'
import { adminAuth }          from '@/lib/firebase/admin'
import { createAdminClient }  from '@/lib/supabase/admin'
import { writeAuditLog }      from '@/lib/utils/audit'

const MAX_ATTEMPTS = 3
const CODE_CHARS   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCode(length = 6): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, b => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, commander_uid, code, firebase_id_token } = body

    if (!commander_uid) {
      return NextResponse.json({ error: 'commander_uid required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── ACTION: generate_code ────────────────
    if (action === 'generate_code') {
      const { data: commander } = await supabase
        .from('commanders')
        .select('uid, name, status, verification_status')
        .eq('uid', commander_uid)
        .single()

      // SECURITY: this endpoint is unauthenticated by necessity (it runs
      // before the caller has any session) — meaning anyone can POST any
      // commander_uid here. To prevent account enumeration, every outcome
      // below returns the EXACT SAME generic response, whether the
      // commander doesn't exist, is disabled, or is already linked. An
      // attacker probing UIDs gets no signal either way — only the real
      // account owner, watching their own in-game/notification channel
      // for the actual code, can tell whether anything happened.
      const genericResponse = () => NextResponse.json({
        success: true,
        message: 'If this Commander ID is valid and eligible, a verification code has been generated.',
      })

      if (!commander) return genericResponse()
      if (commander.status === 'disabled') return genericResponse()
      if (commander.verification_status === 'linked') return genericResponse()

      // Cooldown — stops an attacker (or a mis-clicking legitimate user)
      // from repeatedly regenerating codes for the same UID in rapid
      // succession. A real account owner never needs a new code more
      // than once a minute.
      const { data: existingCode } = await supabase
        .from('verification_codes')
        .select('created_at')
        .eq('commander_uid', commander_uid)
        .single()

      if (existingCode) {
        const secondsSinceLast = (Date.now() - new Date(existingCode.created_at).getTime()) / 1000
        if (secondsSinceLast < 60) return genericResponse()
      }

      const newCode   = generateCode()
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

      await supabase
        .from('verification_codes')
        .upsert({
          commander_uid,
          code:          newCode,
          expires_at:    expiresAt,
          used:          false,
          attempt_count: 0,
          created_at:    new Date().toISOString(),
        }, { onConflict: 'commander_uid' })

      await supabase
        .from('commanders')
        .update({ verification_status: 'code_sent' })
        .eq('uid', commander_uid)

      // In production: notify Supreme via realtime/FCM
      // For now: log to console (Supreme checks server logs or admin panel)
      console.log(`\n[VERIFICATION CODE]\nCommander: ${commander.name} (${commander_uid})\nCode: ${newCode}\nExpires: ${expiresAt}\n`)

      return genericResponse()
    }

    // ── ACTION: verify_code ──────────────────
    if (action === 'verify_code') {
      if (!code) {
        return NextResponse.json({ error: 'code required' }, { status: 400 })
      }

      const { data: record, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('commander_uid', commander_uid)
        .single()

      if (error || !record) {
        return NextResponse.json({ error: 'No verification code found. Request a new one.' }, { status: 404 })
      }
      if (new Date() > new Date(record.expires_at)) {
        return NextResponse.json({ error: 'Code has expired. Request a new one.' }, { status: 410 })
      }
      if (record.used) {
        return NextResponse.json({ error: 'Code already used.' }, { status: 409 })
      }
      if (record.attempt_count >= MAX_ATTEMPTS) {
        return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
      }

      // Increment attempts before comparing (prevents brute force)
      await supabase
        .from('verification_codes')
        .update({ attempt_count: record.attempt_count + 1 })
        .eq('commander_uid', commander_uid)

      if (record.code !== code.toUpperCase().trim()) {
        const remaining = MAX_ATTEMPTS - (record.attempt_count + 1)
        return NextResponse.json({
          error: `Incorrect code. ${remaining} attempt(s) remaining.`
        }, { status: 400 })
      }

      // Code is correct — mark used, update commander
      await supabase
        .from('verification_codes')
        .update({ used: true })
        .eq('commander_uid', commander_uid)

      await supabase
        .from('commanders')
        .update({ verification_status: 'verified' })
        .eq('uid', commander_uid)

      return NextResponse.json({ success: true })
    }

    // ── ACTION: link_firebase ────────────────
    if (action === 'link_firebase') {
      if (!firebase_id_token) {
        return NextResponse.json({ error: 'firebase_id_token required' }, { status: 400 })
      }

      // Verify the Firebase token
      const decoded = await adminAuth.verifyIdToken(firebase_id_token).catch(() => null)
      if (!decoded) {
        return NextResponse.json({ error: 'Invalid Firebase token' }, { status: 401 })
      }

      const firebaseUid = decoded.uid

      // Get commander — must be in 'verified' state
      const { data: commander } = await supabase
        .from('commanders')
        .select('uid, name, role, alliance_id, verification_status, linked_google_uid')
        .eq('uid', commander_uid)
        .single()

      // SECURITY: same enumeration concern as generate_code above — ANY
      // Google account holder can call this with a guessed commander_uid.
      // "Not found" and "not verified yet" are collapsed into one generic
      // response so a scan of UIDs can't distinguish real accounts from
      // fake ones. (Once an account IS in 'verified' state, reaching that
      // state already required knowing the real, secret, rate-limited
      // code — so the more specific conflict messages past this point are
      // safe to keep, since an attacker can't have engineered their way
      // into a 'verified' commander_uid they don't actually own.)
      if (!commander || commander.verification_status !== 'verified') {
        return NextResponse.json(
          { error: 'This account is not ready to be linked yet.' },
          { status: 400 }
        )
      }
      if (commander.linked_google_uid && commander.linked_google_uid !== firebaseUid) {
        return NextResponse.json({ error: 'Already linked to a different Google account' }, { status: 409 })
      }

      // Check no other commander uses this Firebase UID
      const { data: existing } = await supabase
        .from('commanders')
        .select('uid')
        .eq('linked_google_uid', firebaseUid)
        .neq('uid', commander_uid)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: 'This Google account is already linked to another commander.' },
          { status: 409 }
        )
      }

      // Link the accounts
      await supabase
        .from('commanders')
        .update({
          linked_google_uid:   firebaseUid,
          verification_status: 'linked',
          status:              'active',
          updated_at:          new Date().toISOString(),
        })
        .eq('uid', commander_uid)

      // Fetch alliance tag for claims
      const { data: alliance } = commander.alliance_id
        ? await supabase.from('alliances').select('tag').eq('id', commander.alliance_id).single()
        : { data: null }

      // Set Firebase custom claims
      await adminAuth.setCustomUserClaims(firebaseUid, {
        commander_uid:  commander.uid,
        commander_name: commander.name,
        role:           commander.role,
        alliance_id:    commander.alliance_id,
        alliance_tag:   alliance?.tag ?? null,
      })

      // Write audit log
      await writeAuditLog({
        action:               'verification_completed',
        performed_by:         commander_uid,
        performed_by_role:    commander.role,
        performed_by_display: commander.name,
        target_commander_uid: commander_uid,
        target_alliance_id:   commander.alliance_id,
        metadata: { firebase_uid: firebaseUid },
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('[VERIFY]', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}