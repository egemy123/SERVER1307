// app/(public)/register/page.tsx
// Step 1 of verification: Enter commander UID
// Looks up commander in Supabase, shows IdentityCard, then redirects to /verify/[uid]
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Commander } from '@/lib/types'

const ROLE_LABELS: Record<string, string> = {
  supreme: 'Supreme', r5: 'R5 — Leader', r4: 'R4 — Minister',
  r3: 'R3', r2: 'R2', r1: 'R1',
}

export default function RegisterPage() {
  const [uid,       setUid]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [commander, setCommander] = useState<Commander | null>(null)

  const handleLookup = async () => {
    const trimmed = uid.trim()
    if (!trimmed) { setError('Please enter your Commander UID'); return }

    setLoading(true)
    setError('')
    setCommander(null)

    try {
      const supabase = createClient()
      const { data: raw, error: dbErr } = await supabase
        .from('commanders')
        .select('*')
        .eq('uid', trimmed)
        .single()

      const data = raw as Commander | null

      if (dbErr || !data) {
        setError('Commander UID not found. Contact your Supreme to ensure your UID has been added to the system.')
        return
      }
      if (data.status === 'disabled') {
        setError('This commander account has been disabled. Contact your Supreme.')
        return
      }
      if (data.verification_status === 'linked') {
        setError('This commander is already verified and linked. Go to login instead.')
        return
      }

      setCommander(data as Commander)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = () => {
    if (commander) window.location.href = `/verify/${commander.uid}`
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
          <p className="text-sm text-tactical-500 mt-1">1307 Alliance Command Center</p>
        </div>

        {/* UID Entry */}
        {!commander && (
          <div className="glass-card-raised p-8 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-tactical-900">Find your commander</p>
              <p className="text-sm text-tactical-500 mt-1">
                Enter your in-game Commander UID to begin verification.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">
                Commander UID
              </label>
              <input
                type="text"
                value={uid}
                onChange={e => setUid(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="Enter your UID..."
                className="input-base font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-tactical-400 mt-1.5">
                Your UID is found in-game under your profile.
              </p>
            </div>

            <button
              onClick={handleLookup}
              disabled={loading || !uid.trim()}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Searching...
                </span>
              ) : 'Find My Commander'}
            </button>

            <div className="text-center">
              <p className="text-xs text-tactical-400">
                Already verified?{' '}
                <a href="/login" className="text-accent-mid font-medium hover:underline">
                  Sign in
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Identity confirmation card */}
        {commander && (
          <div className="flex flex-col gap-4 animate-fade-in">

            {/* Commander card */}
            <div className="glass-card-raised p-6 border border-accent/20">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center shrink-0">
                  <span className="text-2xl font-bold text-accent-deep">
                    {commander.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-tactical-900 text-lg leading-tight">
                      {commander.name}
                    </h2>
                    <span className="badge badge-active">
                      {ROLE_LABELS[commander.role] ?? commander.role}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-tactical-400 mt-1">
                    UID: {commander.uid}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-tactical-100 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-tactical-500">Status</p>
                  <p className="text-sm font-medium text-tactical-800 capitalize mt-0.5">
                    {commander.status}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-tactical-500">Verification</p>
                  <p className="text-sm font-medium text-tactical-800 capitalize mt-0.5">
                    {commander.verification_status.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-accent-light border border-accent/20">
                <p className="text-xs text-accent-deep">
                  Your Supreme will verify your identity via in-game private message.
                  Make sure this is your commander before continuing.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setCommander(null); setUid('') }}
                className="btn-secondary flex-1"
              >
                Not me
              </button>
              <button
                onClick={handleConfirm}
                className="btn-primary flex-1"
              >
                Yes, this is me →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}