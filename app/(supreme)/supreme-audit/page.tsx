'use client'
// app/(supreme)/supreme-audit/page.tsx
import { useEffect, useState } from 'react'

interface AuditEntry {
  id:                   string
  action:               string
  performed_by:         string
  performed_by_role:    string
  performed_by_display: string
  target_commander_uid: string | null
  target_alliance_id:   string | null
  alliance_tag?:        string | null
  metadata:             Record<string, any> | null
  created_at:           string
}

interface Alliance {
  id:  string
  tag: string
}

export default function SupremeAuditPage() {
  const [entries,        setEntries]        = useState<AuditEntry[]>([])
  const [alliances,      setAlliances]      = useState<Alliance[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [allianceFilter, setAllianceFilter] = useState<string>('all')
  const [page,           setPage]           = useState(1)
  const PER_PAGE = 30

  const load = async () => {
    setLoading(true)
    const [auditRes, allianceRes] = await Promise.all([
      fetch('/api/supreme/audit'),
      fetch('/api/supreme/alliances'),
    ])
    const auditData    = await auditRes.json()
    const allianceData = await allianceRes.json()
    setEntries(auditData.entries       ?? [])
    setAlliances(allianceData.alliances ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = entries.filter(e => {
    const matchAlliance =
      allianceFilter === 'all' ||
      e.target_alliance_id === allianceFilter

    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      e.action.toLowerCase().includes(q) ||
      e.performed_by_display.toLowerCase().includes(q) ||
      (e.target_commander_uid ?? '').toLowerCase().includes(q) ||
      (e.alliance_tag ?? '').toLowerCase().includes(q)

    return matchAlliance && matchSearch
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  }

  const ACTION_COLOR: Record<string, string> = {
    verification_completed:  'badge-active',
    commander_removed:       'badge-warning',
    alliance_created:        'badge-active',
    alliance_status_changed: 'badge-warning',
    role_changed:            'badge-warning',
    commander_disabled:      'badge-inactive',
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="glass-card p-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-tactical-900">Supreme Audit Log</h1>
          <p className="text-xs text-tactical-500 mt-0.5">{filtered.length} entries</p>
        </div>
        <button onClick={load}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay
                           text-tactical-700 hover:bg-tactical-100 transition-colors">
          ↺ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col sm:flex-row gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search action, commander, alliance…"
          className="flex-1 px-3 py-2 rounded-xl border border-tactical-200 text-sm
                     bg-white text-tactical-900 focus:outline-none focus:border-accent"
        />
        <select
          value={allianceFilter}
          onChange={e => { setAllianceFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-xl border border-tactical-200 text-sm
                     bg-white text-tactical-900 focus:outline-none focus:border-accent"
        >
          <option value="all">All Alliances</option>
          {alliances.map(a => (
            <option key={a.id} value={a.id}>[{a.tag}]</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-tactical-400">Loading…</p>
        </div>
      ) : paginated.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-tactical-400">No entries found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paginated.map(e => (
            <div key={e.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${ACTION_COLOR[e.action] ?? 'badge-inactive'}`}>
                      {e.action.replace(/_/g, ' ')}
                    </span>
                    {e.alliance_tag && (
                      <span className="badge badge-inactive font-mono text-xs">
                        [{e.alliance_tag}]
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-tactical-700 mt-1">
                    By: <span className="font-medium">{e.performed_by_display}</span>
                    <span className="text-tactical-400 ml-1">({e.performed_by_role})</span>
                  </p>
                  {e.target_commander_uid && (
                    <p className="text-xs text-tactical-500">
                      Target: <span className="font-mono">{e.target_commander_uid}</span>
                    </p>
                  )}
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <p className="text-xs text-tactical-400 font-mono truncate">
                      {JSON.stringify(e.metadata)}
                    </p>
                  )}
                </div>
                <p className="text-xs text-tactical-400 font-mono shrink-0 whitespace-nowrap">
                  {formatDate(e.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay
                       text-tactical-700 hover:bg-tactical-100 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-tactical-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay
                       text-tactical-700 hover:bg-tactical-100 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

    </div>
  )
}