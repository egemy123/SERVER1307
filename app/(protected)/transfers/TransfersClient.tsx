'use client'

// app/(protected)/transfers/TransfersClient.tsx
// Client component — receives role as prop, no document.querySelector needed

import { useState, useEffect } from 'react'
import type { Role } from '@/lib/types'

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

interface Alliance {
  id: string
  tag: string
  name: string
  status: string
}

interface Props {
  role:         Role
  commanderUid: string
  allianceId:   string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'badge-warning',
  approved: 'badge-active',
  rejected: 'badge-disabled',
}

export default function TransfersClient({ role, commanderUid, allianceId }: Props) {
  const [transfers,        setTransfers]        = useState<Transfer[]>([])
  const [alliances,        setAlliances]         = useState<Alliance[]>([])
  const [loading,          setLoading]           = useState(true)
  const [acting,           setActing]            = useState<string | null>(null)
  const [msg,              setMsg]               = useState('')
  const [msgOk,            setMsgOk]             = useState(true)
  const [selectedAlliance, setSelectedAlliance]  = useState<string>('')
  const [searchAlliance,   setSearchAlliance]    = useState('')
  const [submitting,       setSubmitting]        = useState(false)

  const isR4Plus = ['r4', 'r5', 'supreme'].includes(role)

  const [tab, setTab] = useState<'pending' | 'history' | 'request'>(
    isR4Plus ? 'pending' : 'request'
  )

  useEffect(() => { fetchTransfers(); fetchAlliances() }, [])

  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/transfers')
      const data = await res.json()
      setTransfers(data.transfers ?? [])
    } catch { flash('Failed to load', false) }
    finally   { setLoading(false) }
  }

  const fetchAlliances = async () => {
    try {
      const res  = await fetch('/api/admin/alliances')
      const data = await res.json()
      setAlliances(data.alliances ?? [])
    } catch {}
  }

  const flash = (text: string, ok = true) => {
    setMsg(text); setMsgOk(ok)
    setTimeout(() => setMsg(''), 4000)
  }

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    try {
      const res  = await fetch(`/api/transfers/${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transfer_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error, false); return }
      flash(`Transfer ${action}d successfully`)
      fetchTransfers()
    } catch { flash('Action failed', false) }
    finally   { setActing(null) }
  }

  const handleRequest = async () => {
    if (!selectedAlliance) return
    setSubmitting(true)
    try {
      const res  = await fetch('/api/transfers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to_alliance_id: selectedAlliance }),
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error, false); return }
      flash('Transfer request submitted successfully')
      setSelectedAlliance(''); setSearchAlliance('')
      fetchTransfers()
    } catch { flash('Failed to submit', false) }
    finally   { setSubmitting(false) }
  }

  const pending    = transfers.filter(t => t.status === 'pending')
  const history    = transfers.filter(t => t.status !== 'pending')
  const myRequests = transfers.filter(t => t.commander_uid === commanderUid)

  const filteredAlliances = alliances.filter(a =>
    a.id !== allianceId &&
    a.status !== 'inactive' &&
    (a.tag.toLowerCase().includes(searchAlliance.toLowerCase()) ||
     a.name.toLowerCase().includes(searchAlliance.toLowerCase()))
  )

  const selectedAllianceName = alliances.find(a => a.id === selectedAlliance)

  const tabs = [
    ...(isR4Plus ? [
      { key: 'pending' as const,  label: `Inbox (${pending.length})` },
      { key: 'history' as const,  label: `History (${history.length})` },
    ] : [
      { key: 'history' as const,  label: `My Requests (${myRequests.length})` },
    ]),
    { key: 'request' as const, label: 'Request Transfer' },
  ]

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">Transfer Requests</h1>
        <p className="page-subtitle">
          {isR4Plus
            ? `${pending.length} pending · ${history.length} processed`
            : `${myRequests.length} request${myRequests.length !== 1 ? 's' : ''} submitted`
          }
        </p>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msgOk
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>{msg}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-raised rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-tactical-900 shadow-sm'
                : 'text-tactical-500 hover:text-tactical-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REQUEST TAB ── */}
      {tab === 'request' && (
        <div className="flex flex-col gap-4">
          {myRequests.filter(r => r.status === 'pending').length > 0 && (
            <div className="glass-card p-4">
              <p className="text-sm font-semibold text-tactical-700 mb-3">Your Pending Requests</p>
              <div className="flex flex-col gap-2">
                {myRequests.filter(r => r.status === 'pending').map(t => {
                  const dest = alliances.find(a => a.id === t.to_alliance_id)
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-overlay">
                      <div>
                        <p className="text-sm font-medium text-tactical-900">
                          → [{dest?.tag ?? '...'}] {dest?.name ?? ''}
                        </p>
                        <p className="text-xs text-tactical-400 mt-0.5">
                          {new Date(t.requested_at).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="glass-card p-5">
            <p className="font-semibold text-tactical-900 mb-1">Request a Transfer</p>
            <p className="text-sm text-tactical-500 mb-4">
              Select the alliance you want to transfer to. Their R4/R5 will review your request.
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Search by tag or name..."
                value={searchAlliance}
                onChange={e => { setSearchAlliance(e.target.value); setSelectedAlliance('') }}
                className="input-field text-sm"
              />
              {searchAlliance.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                  {filteredAlliances.length === 0 && (
                    <p className="text-sm text-tactical-400 text-center py-4">No alliances found</p>
                  )}
                  {filteredAlliances.map(a => (
                    <button key={a.id}
                      onClick={() => { setSelectedAlliance(a.id); setSearchAlliance('') }}
                      className="flex items-center gap-3 p-3 rounded-xl text-left bg-surface-overlay hover:bg-surface-raised transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-accent-light flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-accent-deep">{a.tag.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-tactical-900">[{a.tag}]</p>
                        <p className="text-xs text-tactical-500">{a.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedAlliance && selectedAllianceName && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-accent-light border border-accent/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-white">{selectedAllianceName.tag.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-tactical-900">
                        [{selectedAllianceName.tag}] {selectedAllianceName.name}
                      </p>
                      <p className="text-xs text-tactical-500">Selected destination</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedAlliance('')}
                    className="text-tactical-400 hover:text-tactical-600 text-sm">✕</button>
                </div>
              )}
              <button onClick={handleRequest}
                disabled={!selectedAlliance || submitting}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed">
                {submitting ? 'Submitting...' : 'Submit Transfer Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INBOX TAB ── */}
      {tab === 'pending' && isR4Plus && (
        <TransferList transfers={pending} loading={loading} acting={acting}
          alliances={alliances} emptyMsg="No pending transfer requests"
          showActions onAction={handleAction} />
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <TransferList
          transfers={isR4Plus ? history : myRequests}
          loading={loading} acting={acting} alliances={alliances}
          emptyMsg={isR4Plus ? 'No transfer history' : 'No requests submitted yet'}
          showActions={false} onAction={handleAction} />
      )}
    </div>
  )
}

function TransferList({ transfers, loading, acting, alliances, emptyMsg, showActions, onAction }: {
  transfers:   Transfer[]
  loading:     boolean
  acting:      string | null
  alliances:   Alliance[]
  emptyMsg:    string
  showActions: boolean
  onAction:    (id: string, action: 'approve' | 'reject') => void
}) {
  if (loading) return (
    <div className="flex justify-center py-12">
      <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  if (transfers.length === 0) return (
    <div className="glass-card p-12 text-center">
      <p className="text-tactical-400 text-sm">{emptyMsg}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {transfers.map(t => {
        const dest = alliances.find(a => a.id === t.to_alliance_id)
        return (
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
                {dest ? `[${dest.tag}] ${dest.name}` : 'This alliance'}
              </span>
            </div>
            <p className="text-xs text-tactical-400 mt-2">
              Requested: {new Date(t.requested_at).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {t.reviewed_at && (
              <p className="text-xs text-tactical-400 mt-0.5">
                Reviewed: {new Date(t.reviewed_at).toLocaleString('en-GB', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
            {showActions && t.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => onAction(t.id, 'reject')} disabled={acting === t.id}
                  className="btn-danger flex-1 text-sm py-2">Reject</button>
                <button onClick={() => onAction(t.id, 'approve')} disabled={acting === t.id}
                  className="btn-primary flex-1 text-sm py-2">
                  {acting === t.id ? 'Processing...' : 'Approve'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}