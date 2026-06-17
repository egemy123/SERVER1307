// lib/firebase/client.ts
// Firebase CLIENT SDK — browser only
// Handles: Google OAuth sign-in, ID token retrieval
// Does NOT handle any database operations

import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
}

const app  = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)

const googleProvider = new GoogleAuthProvider()
googleProvider.addScope('email')
googleProvider.addScope('profile')
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** Sign in with Google popup — returns Firebase User */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

/** Sign out and clear server session cookie */
export async function signOutUser(): Promise<void> {
  await signOut(auth)
  await fetch('/api/auth/session', { method: 'DELETE' })
}

/** Get current user ID token (forceRefresh = true gets latest claims) */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return await user.getIdToken(forceRefresh)
}

/**
 * Create server-side session after Google sign-in
 * Exchanges Firebase ID token for HttpOnly session cookie
 */
export async function createSession(user: User): Promise<{
  success: boolean
  is_linked?: boolean
  needs_verify?: boolean
  error?: string
}> {
  const idToken = await user.getIdToken()
  const res = await fetch('/api/auth/session', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ idToken }),
  })
  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error }
  return { success: true, ...data }
}

/** Subscribe to auth state changes */
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export { auth, app }
export type { User }