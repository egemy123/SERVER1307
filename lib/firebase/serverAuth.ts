// lib/firebase/serverAuth.ts
// Server-side auth helpers — import in ALL server actions and API routes
// This is the PRIMARY security layer for every mutation

import { cookies } from 'next/headers'
import {
  verifySessionCookie,
  SESSION_COOKIE_NAME,
  type FirebaseDecodedClaims,
} from '@/lib/firebase/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { can } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types'

export type AuthContext = FirebaseDecodedClaims

/**
 * Live commander lookup — mirrors middleware.ts's fetchLiveCommander.
 * role/alliance_id/name must NEVER be trusted from the session cookie's
 * custom claims, because those claims are frozen at whatever moment the
 * ID token used to mint the cookie was issued — they do not reflect a
 * role change, alliance move, or verification that happened afterward.
 * The cookie is only trustworthy for one thing: commander_uid, which is
 * verified by Firebase and never changes after registration.
 */
async function fetchLiveCommander(commanderUid: string) {
  const supabase = createAdminClient()

  const { data: commander, error } = await supabase
    .from('commanders')
    .select('role, alliance_id, name, status')
    .eq('uid', commanderUid)
    .single()

  if (error || !commander || commander.status === 'disabled') return null

  let allianceTag: string | null = null
  if (commander.alliance_id) {
    const { data: alliance } = await supabase
      .from('alliances')
      .select('tag')
      .eq('id', commander.alliance_id)
      .single()
    allianceTag = alliance?.tag ?? null
  }

  return {
    role:           commander.role,
    alliance_id:    commander.alliance_id,
    alliance_tag:   allianceTag,
    commander_name: commander.name,
  }
}

/**
 * Verify Firebase session cookie — call at top of EVERY server action
 * Returns null if session is invalid, expired, or missing.
 *
 * Identity (commander_uid) comes from the verified cookie. Everything
 * that can change after login — role, alliance_id, alliance_tag, name —
 * is looked up live from Supabase, same as middleware.ts does. This is
 * what keeps API routes and page rendering in agreement; before this
 * fix, a page could render as fully authorized (middleware's live
 * lookup) while the same request's POST 401'd (this function's stale
 * cookie claims) whenever the cookie predated a claims/role update.
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const cookieStore   = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null

  const decoded = await verifySessionCookie(sessionCookie, true)
  if (!decoded) return null
  if (!decoded.commander_uid) return null

  const live = await fetchLiveCommander(decoded.commander_uid)
  if (!live || !live.role) return null

  return {
    ...decoded,
    role:           live.role,
    alliance_id:    live.alliance_id,
    alliance_tag:   live.alliance_tag,
    commander_name: live.commander_name,
  }
}

/**
 * Require auth AND minimum role
 * Returns null if not authenticated or role insufficient
 */
export async function requireRole(minimumRole: Role): Promise<AuthContext | null> {
  const auth = await requireAuth()
  if (!auth) return null
  if (!can.hasRole(auth.role as Role, minimumRole)) return null
  return auth
}

/**
 * Require auth AND alliance scope match
 * Supreme bypasses alliance check (can access any alliance)
 * Everyone else must belong to the alliance and meet minimum role
 */
export async function requireAllianceAccess(
  allianceId: string,
  minimumRole: Role = 'r1'
): Promise<AuthContext | null> {
  const auth = await requireAuth()
  if (!auth) return null

  // Supreme can access any alliance
  if (auth.role === 'supreme') return auth

  // Others must belong to the requested alliance
  if (auth.alliance_id !== allianceId) return null

  // Check minimum role
  if (!can.hasRole(auth.role as Role, minimumRole)) return null

  return auth
}

/**
 * Require Supreme role specifically
 */
export async function requireSupreme(): Promise<AuthContext | null> {
  const auth = await requireAuth()
  if (!auth) return null
  if (auth.role !== 'supreme') return null
  return auth
}