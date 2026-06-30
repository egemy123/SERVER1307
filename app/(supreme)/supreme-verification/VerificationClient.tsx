'use client'
// app/(supreme)/supreme-verification/VerificationClient.tsx
import { useState } from 'react'

interface CodeRecord {
  code:          string
  expires_at:    string
  used:          boolean
  attempt_count: number
}

interface CommanderRow {
  uid:                  string
  name:                 string
  role:                 string
  verification_status:  string
  alliance_id:          string | null
  alliance_tag:         string | null
  alliance_name:        string | null
  code_record:          CodeRecord | null
}

interface Alliance {
  id:   string
  tag:  string
  name: string
}

const STATUS_STYLES: Record<string, string> = {
  code_sent:  'bg-blue-100 text-blue-700 border border-blue-300',
  pending:    'bg-amber-100 text-amber-700 border border-amber-300',
  verified:   'bg-green-100 text-green-700 border border-green-300',
  rejected:   'bg-red-100 text-red-700 border border-red-300',
  unverified: 'bg-gray-100 text-gray-600 border border-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  code_sent:  'Code Sent',
  pending:    'Pending',
  verified:   'Verified',
  rejected:   'Rejected',
  unverified: 'Unverified',
}

export default function VerificationClient({
  initialCommanders,
  alliances,
  performedByUid,
  performedByName,
}: {
  initialCommanders: CommanderRow[]
  alliances:         Alliance[]
  performedByUid:    string
  performedByName:   string
}) {
  const [commanders, setCommanders] = useState(initialCommanders)
  const [allianceFilter, setAllianceFilter] = useState('all')
  const [busyUid, setBusyUid] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filtered = commanders.filter(c =>
    allianceFilter === 'all' || c.alliance_id === allianceFilter
  )

  const pendingCount = commanders.filter(
    c => c.verification_status === 'code_sent' || c.verification_status === 'pending'
  ).length

  const handleAction = async (uid: string, allianceId: string | null, action: 'verify' | 'reject') => {
    setBusyUid(uid)
    setError('')
    try {
      const res = await fetch('/api/supreme/verification', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          commander_uid:    uid,
          alliance_id:      allianceId,
          performed_by_uid: performedByUid,
          performed_by_name: performedByName,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Action failed'); return }

      setCommanders(prev =>
        action === 'verify'
          ? prev.map(c => c.uid === uid ? { ...c, verification_status: 'verified' } : c)
          : prev.map(c => c.uid === uid ? { ...c, verification_status: 'rejected' } : c)
      )
    } finally {
      setBusyUid(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-2xl mx-auto pb-20 lg:pb-0">

      {/* Header */}
      <div>
        <h1 className="page-title">Verification Queue</h1>
        <p className="page-subtitle">
          {pendingCount > 0
            ? `${pendingCount} commander${pendingCount !== 1 ? 's' : ''} awaiting verification`
            : 'All commanders verified'}
        </p>
      </div>

      {/* Alliance filter */}
      <div className="glass-card p-3">
        <select
          value={allianceFilter}
          onChange={e => setAllianceFilter(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                     bg-white text-tactical-900 focus:outline-none focus:border-accent"
        >
          <option value="all">All Alliances ({commanders.length})</option>
          {alliances.map(a => {
            const count = commanders.filter(c => c.alliance_id === a.id).length
            return (
              <option key={a.id} value={a.id}>
                [{a.tag}] {a.name} ({count})
              </option>
            )
          })}
        </select>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Queue */}
      <div className="glass-card p-5">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-tactical-900">No pending verifications</p>
            <p className="text-sm text-tactical-400 mt-1">
              {allianceFilter === 'all'
                ? 'All commanders are verified'
                : 'This alliance has no pending commanders'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {filtered.map(c => {
              const codeRecord = c.code_record
              const hasActiveCode =
                codeRecord && !codeRecord.used && new Date(codeRecord.expires_at) > new Date()
              const isExpired =
                codeRecord && !codeRecord.used && new Date(codeRecord.expires_at) <= new Date()
              const busy = busyUid === c.uid

              return (
                <div key={c.uid} className="py-4 flex flex-col gap-3">

                  {/* Top row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-tactical-900 truncate">{c.name}</p>
                        {c.alliance_tag && (
                          <span className="badge badge-inactive font-mono text-xs">
                            [{c.alliance_tag}]
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-tactical-500 uppercase font-medium">
                          {c.role}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          STATUS_STYLES[c.verification_status] ?? STATUS_STYLES.unverified
                        }`}>
                          {STATUS_LABELS[c.verification_status] ?? c.verification_status}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAction(c.uid, c.alliance_id, 'verify')}
                        disabled={busy || c.verification_status === 'verified'}
                        className="text-xs px-3 py-1.5 rounded-xl bg-green-600 text-white
                                   font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {busy ? '…' : '✓ Verify'}
                      </button>
                      {c.verification_status !== 'rejected' && (
                        <button
                          onClick={() => handleAction(c.uid, c.alliance_id, 'reject')}
                          disabled={busy}
                          className="text-xs px-3 py-1.5 rounded-xl border border-red-300
                                     text-red-600 font-medium hover:bg-red-50 transition-colors
                                     disabled:opacity-50"
                        >
                          {busy ? '…' : '✕ Reject'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active code */}
                  {hasActiveCode && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3
                                    flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-blue-600 font-medium mb-0.5">
                          Verification Code — send this in-game
                        </p>
                        <p className="font-mono text-xl font-bold text-blue-800 tracking-[0.3em]">
                          {codeRecord!.code}
                        </p>
                        <p className="text-xs text-blue-500 mt-0.5">
                          Expires{' '}
                          {new Date(codeRecord!.expires_at).toLocaleTimeString('en-GB', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {' · '}{codeRecord!.attempt_count}/3 attempts used
                        </p>
                      </div>
                      <span className="text-2xl">📨</span>
                    </div>
                  )}

                  {/* Expired code */}
                  {isExpired && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                      <p className="text-xs text-amber-700 font-medium">
                        ⏱ Code expired — commander must request a new one
                      </p>
                    </div>
                  )}

                  {/* No code yet */}
                  {!codeRecord && c.verification_status !== 'rejected' && (
                    <div className="rounded-xl border border-tactical-100 bg-surface-overlay px-4 py-3">
                      <p className="text-xs text-tactical-400">
                        No code requested yet — commander hasn't started verification
                      </p>
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
