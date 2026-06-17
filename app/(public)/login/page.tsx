// app/(public)/login/page.tsx

'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithGoogle, createSession } from '@/lib/firebase/client'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-500">Loading...</p>
    </div>
  )
}

function LoginContent() {
  const router = useRouter()
  const params = useSearchParams()

  const redirect = params.get('redirect') ?? '/dashboard'
  const errorParam = params.get('error')

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState(
    errorParam === 'access_denied'
      ? 'You do not have permission to access that page.'
      : errorParam === 'wrong_alliance'
      ? 'You cannot access another alliance.'
      : errorParam === 'disabled'
      ? 'Your account has been disabled. Contact your Supreme.'
      : ''
  )

  const handleSignIn = async () => {
    setLoading(true)
    setError('')

    try {
      const user = await signInWithGoogle()

      const result = await createSession(user)

      if (!result.success) {
        setError(result.error ?? 'Sign-in failed. Please try again.')
        return
      }

      if (result.needs_verify) {
        router.push('/register')
      } else {
        router.push(redirect)
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        // User closed popup
      } else if (
        err?.code ===
        'auth/account-exists-with-different-credential'
      ) {
        setError(
          'This Google account is already linked to a different commander.'
        )
      } else if (err?.code === 'auth/popup-blocked') {
        setError(
          'Popup was blocked. Please allow popups for this site and try again.'
        )
      } else {
        setError('Sign-in failed. Please try again.')
        console.error('[LOGIN]', err)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'linear-gradient(135deg, #F8FAFC 0%, #EEF2F7 100%)',
      }}
    >
      {/* Tactical grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(#22C55E 1px, transparent 1px), linear-gradient(90deg, #22C55E 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-sm flex flex-col gap-6 animate-fade-in">
        {/* Brand header */}
        <div className="text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4"
            style={{
              boxShadow:
                '0 0 0 1px rgba(34,197,94,0.2), 0 8px 32px rgba(34,197,94,0.15)',
            }}
          >
            <span className="text-white text-2xl font-bold">◈</span>
          </div>

          <h1 className="text-2xl font-semibold text-tactical-900">
            Command Center
          </h1>

          <p className="text-sm text-tactical-500 mt-1">
            1307 Alliance Command Center #7C
          </p>

          <p className="text-xs text-tactical-400 mt-0.5 font-mono">
            Last War: Survival
          </p>
        </div>

        {/* Login card */}
        <div className="glass-card-raised p-8 flex flex-col gap-5">
          <div>
            <p className="font-semibold text-tactical-900">
              Welcome back, Commander
            </p>

            <p className="text-sm text-tactical-500 mt-1">
              Sign in with your linked Google account to access the platform.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl
                       bg-white border border-tactical-200 text-tactical-800 font-medium text-sm
                       hover:bg-gray-50 hover:border-tactical-300 hover:shadow-md
                       active:scale-[0.98] transition-all duration-150
                       disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              'Signing in...'
            ) : (
              'Continue with Google'
            )}
          </button>

          <div className="text-center">
            <p className="text-xs text-tactical-400">
              Not registered?{' '}
              <a
                href="/register"
                className="text-accent-mid font-medium hover:underline"
              >
                Verify your commander
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-tactical-400">
          Access restricted to verified commanders only.
          <br />
          Contact your Supreme for registration assistance.
        </p>
      </div>
    </div>
  )
}