// lib/firebase/serverAuth.ts
// Server-side auth helpers — import in ALL server actions and API routes
// This is the PRIMARY security layer for every mutation

import { cookies } from 'next/headers'
import {
  verifySessionCookie,
  SESSION_COOKIE_NAME,
  type FirebaseDecodedClaims,
} from '@/lib/firebase/admin'
import { can } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types'

export type AuthContext = FirebaseDecodedClaims

/**
 * Verify Firebase session cookie — call at top of EVERY server action
 * Returns null if session is invalid, expired, or missing
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const cookieStore   = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null

  const decoded = await verifySessionCookie(sessionCookie, true)
  if (!decoded) return null
  if (!decoded.commander_uid || !decoded.role) return null

  return decoded
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