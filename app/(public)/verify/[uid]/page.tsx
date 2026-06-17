// app/(public)/verify/[uid]/page.tsx
'use client'
import { useState }                   from 'react'
import { useParams, useRouter }       from 'next/navigation'
import { signInWithGoogle, createSession, getIdToken } from '@/lib/firebase/client'

type FlowState = 'confirm' | 'code_sent' | 'code_entry' | 'linking' | 'complete' | 'error'

const STEPS = ['Confirm', 'Get Code', 'Verify', 'Link']

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const uid    = params.uid as string

  const [flow,       setFlow]       = useState<FlowState>('confirm')
  const [code,       setCode]       = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [attempts,   setAttempts]   = useState(0)
  const [cmdName,    setCmdName]    = useState('')

  const currentStep =
    flow === 'confirm'    ? 0 :
    flow === 'code_sent'  ? 1 :
    flow === 'code_entry' ? 2 :
    flow === 'linking'    ? 3 : 3

  // Step 1 — Confirm identity, request code generation
  const handleRequestCode = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'generate_code', commander_uid: uid }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setFlow('code_sent')
    } catch {
      setError('Failed to request code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2 — Submit verification code
  const handleVerifyCode = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'verify_code', commander_uid: uid, code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= 3) {
          setError('Too many failed attempts. Request a new code from your Supreme.')
          setFlow('error')
        } else {
          setError(data.error)
        }
        return
      }
      // Code verified — now link Google account
      setFlow('linking')
      await handleLinkGoogle()
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3 — Google OAuth + link to commander
  const handleLinkGoogle = async () => {
    try {
      const user    = await signInWithGoogle()
      const idToken = await user.getIdToken()

      const res  = await fetch('/api/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:            'link_firebase',
          commander_uid:     uid,
          firebase_id_token: idToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setFlow('error'); return }

      // Create session cookie
      const session = await createSession(user)
      if (!session.success) { setError(session.error ?? 'Session failed'); setFlow('error'); return }

      setCmdName(user.displayName ?? '')
      setFlow('complete')
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in was cancelled. Please try again.')
        setFlow('code_entry')
      } else {
        setError('Google sign-in failed. Please try again.')
        setFlow('error')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2F7 100%)' }}>

      <div className="fixed inset-0 pointer-events-none opacity-[0.025]"
           style={{
             backgroundImage: 'linear-gradient(#22C55E 1px, transparent 1px), linear-gradient(90deg, #22C55E 1px, transparent 1px)',
             backgroundSize: '48px 48px',
           }} />

      <div className="relative w-full max-w-sm flex flex-col gap-6 animate-fade-in">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent mb-4"
               style={{ boxShadow: '0 0 0 1px rgba(34,197,94,0.2), 0 8px 32px rgba(34,197,94,0.15)' }}>
            <span className="text-white text-2xl font-bold">◈</span>
          </div>
          <h1 className="text-2xl font-semibold text-tactical-900">Commander Verification</h1>
          <p className="text-xs font-mono text-tactical-400 mt-1">UID: {uid}</p>
        </div>

        {/* Step indicator */}
        {flow !== 'complete' && flow !== 'error' && (
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                {i > 0 && (
                  <div className={`flex-1 h-px mx-1 ${i <= currentStep ? 'bg-accent' : 'bg-tactical-200'}`} />
                )}
                <div className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0
                  ${i < currentStep  ? 'bg-accent text-white' : ''}
                  ${i === currentStep ? 'bg-accent-light text-accent-deep border-2 border-accent' : ''}
                  ${i > currentStep  ? 'bg-tactical-100 text-tactical-400' : ''}
                `}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── STEP: CONFIRM ── */}
        {flow === 'confirm' && (
          <div className="glass-card-raised p-6 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-tactical-900">Confirm your identity</p>
              <p className="text-sm text-tactical-500 mt-1">
                Your Supreme will send you a verification code via in-game private chat after you confirm.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-accent-light border border-accent/20">
              <p className="text-xs text-accent-deep">
                Make sure you have the in-game chat open so you can receive the code from your Supreme.
              </p>
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => router.push('/register')} className="btn-secondary flex-1">
                Back
              </button>
              <button onClick={handleRequestCode} disabled={loading} className="btn-primary flex-1">
                {loading ? 'Requesting...' : 'Request Code'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: CODE SENT ── */}
        {flow === 'code_sent' && (
          <div className="glass-card-raised p-6 flex flex-col gap-4">
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-accent-light flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">📨</span>
              </div>
              <p className="font-semibold text-tactical-900">Code requested</p>
              <p className="text-sm text-tactical-500 mt-1">
                Your Supreme has been notified. Check your in-game inbox for the 6-character code.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700">
                ⏱ Code expires in 30 minutes. Contact your Supreme if you don't receive it.
              </p>
            </div>
            <button onClick={() => setFlow('code_entry')} className="btn-primary w-full">
              I have the code →
            </button>
          </div>
        )}

        {/* ── STEP: CODE ENTRY ── */}
        {flow === 'code_entry' && (
          <div className="glass-card-raised p-6 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-tactical-900">Enter verification code</p>
              <p className="text-sm text-tactical-500 mt-1">
                Enter the 6-character code sent by your Supreme in-game.
              </p>
            </div>
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
            <div>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                placeholder="e.g. AB3X9K"
                maxLength={6}
                className="input-base font-mono text-center text-2xl tracking-[0.5em] uppercase"
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-tactical-400 mt-1.5 text-center">
                {6 - code.length} characters remaining
              </p>
            </div>
            <button
              onClick={handleVerifyCode}
              disabled={loading || code.length < 6}
              className="btn-primary w-full"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            <button
              onClick={() => { setFlow('confirm'); setCode(''); setError(''); setAttempts(0) }}
              className="btn-ghost w-full text-xs"
            >
              Request a new code
            </button>
          </div>
        )}

        {/* ── STEP: LINKING ── */}
        {flow === 'linking' && (
          <div className="glass-card-raised p-6 flex flex-col items-center gap-4 text-center">
            <svg className="animate-spin h-10 w-10 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <div>
              <p className="font-semibold text-tactical-900">Linking Google account</p>
              <p className="text-sm text-tactical-500 mt-1">You will be redirected to Google sign-in.</p>
            </div>
          </div>
        )}

        {/* ── STEP: COMPLETE ── */}
        {flow === 'complete' && (
          <div className="glass-card-raised p-6 flex flex-col items-center gap-4 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-accent-light flex items-center justify-center">
              <span className="text-3xl text-accent-deep">✓</span>
            </div>
            <div>
              <p className="font-semibold text-tactical-900 text-lg">Verification Complete</p>
              <p className="text-sm text-tactical-500 mt-1">
                Your Google account is now linked. Welcome to the Command Center.
              </p>
            </div>
            <button onClick={() => router.push('/dashboard')} className="btn-primary w-full">
              Enter Command Center →
            </button>
          </div>
        )}

        {/* ── STEP: ERROR ── */}
        {flow === 'error' && (
          <div className="glass-card-raised p-6 flex flex-col gap-4">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700 font-medium">Verification failed</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
            <button onClick={() => router.push('/register')} className="btn-secondary w-full">
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  )
}