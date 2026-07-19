// app/api/auth/session/route.ts
// Creates and deletes Firebase session cookies
// POST: sign in → create HttpOnly session cookie
// DELETE: sign out → revoke and clear cookie

import { NextResponse }  from 'next/server'
import { cookies }       from 'next/headers'
import {
  adminAuth,
  createSessionCookie,
  verifyIdToken,
  SESSION_COOKIE_NAME,
  SESSION_EXPIRY_SECONDS,
} from '@/lib/firebase/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const { idToken } = await req.json()
    console.log('TOKEN RECEIVED')
    console.log(process.env.FIREBASE_ADMIN_PROJECT_ID)
    console.log(process.env.FIREBASE_ADMIN_CLIENT_EMAIL)
    console.log(!!process.env.FIREBASE_ADMIN_PRIVATE_KEY)

    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }

    // Verify the Firebase ID token
    const decoded = await verifyIdToken(idToken)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const firebaseUid = decoded.uid
    const supabase    = createAdminClient()

    // Check if this Firebase UID is linked to a commander
    const { data: commander } = await supabase
      .from('commanders')
      .select('uid, name, role, alliance_id, status')
      .eq('linked_google_uid', firebaseUid)
      .single()

    // If linked commander is disabled — block login
    if (commander?.status === 'disabled') {
      return NextResponse.json(
        { error: 'Your account has been disabled. Contact your Supreme.' },
        { status: 403 }
      )
    }

    // If commander exists — sync latest claims
    if (commander) {
      const { data: alliance } = await supabase
        .from('alliances')
        .select('tag')
        .eq('id', commander.alliance_id)
        .single()

      await adminAuth.setCustomUserClaims(firebaseUid, {
        commander_uid:  commander.uid,
        commander_name: commander.name,
        role:           commander.role,
        alliance_id:    commander.alliance_id,
        alliance_tag:   alliance?.tag ?? null,
      })
    }

    // Create Firebase session cookie (14 days)
    const sessionCookie = await createSessionCookie(idToken)

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_EXPIRY_SECONDS,
      path:     '/',
    })

    return NextResponse.json({
      success:       true,
      is_linked:     !!commander,
      needs_verify:  !commander,
      commander_uid: commander?.uid ?? null,
    })

  } catch (error) {
    console.error('[SESSION POST]', error)
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const cookieStore   = await cookies()
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, false)
        await adminAuth.revokeRefreshTokens(decoded.uid)
      } catch {
        // Cookie may be expired — continue
      }
    }

    cookieStore.delete(SESSION_COOKIE_NAME)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[SESSION DELETE]', error)
    return NextResponse.json({ error: 'Sign out failed' }, { status: 500 })
  }
}