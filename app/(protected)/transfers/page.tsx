// app/(protected)/transfers/page.tsx
'use client'
import { useState, useEffect } from 'react'

interface Transfer {
  id: string
  commander_uid: string
  commander_name: string
  from_alliance_tag: string | null
  to_alliance_id: string
  status: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'badge-warning',
  approved: 'badge-active',
  rejected: 'badge-disabled',
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [acting,    setActing]    = useState<string | null>(null)
  const [msg,       setMsg]       = useState('')
  const [tab,       setTab]       = useState<'pending' | 'history'>('pending')

  useEffect(() => { fetchTransfers() }, [])

  const fetchTransfers = async () => {
    setLoading(true)
    const res  = await fetch('/api/transfers')
    const data = await res.json()
    setTransfers(data.transfers ?? [])
    setLoading(false)
  }

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    setMsg('')
    try {
      const res  = await fetch(`/api/transfers/${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transfer_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg(`Transfer ${action}d successfully`)
      fetchTransfers()
    } catch { setMsg('Action failed') }
    finally  { setActing(null) }
  }

  const pending  = transfers.filter(t => t.status === 'pending')
  const history  = transfers.filter(t => t.status !== 'pending')
  const display  = tab === 'pending' ? pending : history

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">Transfer Requests</h1>
        <p className="page-subtitle">
          {pending.length} pending · {history.length} processed
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msg.includes('success')
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-raised rounded-xl p-1 w-fit">
        {(['pending', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? 'bg-white text-tactical-900 shadow-sm'
                : 'text-tactical-500 hover:text-tactical-700'
            }`}
          >
            {t === 'pending' ? `Pending (${pending.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Transfer cards */}
      {loading ? (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      ) : display.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-tactical-400 text-sm">
            {tab === 'pending' ? 'No pending transfer requests' : 'No transfer history'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {display.map(t => (
            <div key={t.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center shrink-0">
                    <span className="font-bold text-accent-deep text-sm">
                      {t.commander_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-tactical-900">{t.commander_name}</p>
                    <p className="text-xs text-tactical-500 font-mono">{t.commander_uid}</p>
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-inactive'}`}>
                  {t.status}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded bg-surface-overlay text-tactical-600 font-mono text-xs">
                  {t.from_alliance_tag ?? 'No alliance'}
                </span>
                <span className="text-tactical-400">→</span>
                <span className="px-2 py-0.5 rounded bg-accent-light text-accent-deep font-mono text-xs">
                  This alliance
                </span>
              </div>

              <p className="text-xs text-tactical-400 mt-2">
                Requested: {new Date(t.requested_at).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>

              {t.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAction(t.id, 'reject')}
                    disabled={acting === t.id}
                    className="btn-danger flex-1 text-sm py-2"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleAction(t.id, 'approve')}
                    disabled={acting === t.id}
                    className="btn-primary flex-1 text-sm py-2"
                  >
                    {acting === t.id ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}