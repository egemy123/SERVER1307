// lib/firebase/admin.ts
// Firebase ADMIN SDK — server-side ONLY
// NEVER import this in client components or pages
// Used for: token verification, session cookies, custom claims

import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function initAdmin() {
  if (getApps().length > 0) return getApp()
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  })
}

const adminApp  = initAdmin()
const adminAuth = getAuth(adminApp)

export { adminAuth }

// ── CONSTANTS ────────────────────────────────
export const SESSION_COOKIE_NAME    = '__acc_session'
export const SESSION_EXPIRY_MS      = 14 * 24 * 60 * 60 * 1000
export const SESSION_EXPIRY_SECONDS = SESSION_EXPIRY_MS / 1000

// ── SESSION COOKIE ────────────────────────────

/** Create a Firebase session cookie from an ID token */
export async function createSessionCookie(idToken: string): Promise<string> {
  return await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRY_MS,
  })
}

/** Verify session cookie and return decoded claims — null if invalid */
export async function verifySessionCookie(
  sessionCookie: string,
  checkRevoked = true
): Promise<FirebaseDecodedClaims | null> {
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, checkRevoked)
    return decoded as unknown as FirebaseDecodedClaims
  } catch {
    return null
  }
}

/** Verify a raw ID token — used during verification flow */
export async function verifyIdToken(idToken: string): Promise<FirebaseDecodedClaims | null> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)
    return decoded as unknown as FirebaseDecodedClaims
  } catch {
    return null
  }
}

/** Set custom claims on a Firebase user */
export async function setCommanderClaims(
  firebaseUid: string,
  claims: CommanderClaims
): Promise<void> {
  await adminAuth.setCustomUserClaims(firebaseUid, claims)
}

/** Revoke all sessions for a user (immediate effect after role change or disable) */
export async function revokeUserSessions(uid: string): Promise<void> {
  await adminAuth.revokeRefreshTokens(uid)
}

// ── TYPES ─────────────────────────────────────

export interface CommanderClaims {
  commander_uid:  string
  commander_name: string
  role:           string
  alliance_id:    string | null
  alliance_tag:   string | null
}

export interface FirebaseDecodedClaims extends CommanderClaims {
  uid:   string
  email: string
  iat:   number
  exp:   number
}