'use client'
// app/(supreme)/supreme-commanders/page.tsx
import { useEffect, useState } from 'react'

interface Commander {
  uid:                 string
  name:                string
  role:                string
  status:              string
  verification_status: string
  alliance_id:         string | null
  alliance_tag?:       string | null
  linked_google_uid?:  string | null
}

interface Alliance {
  id:  string
  tag: string
  name: string
}

const ROLES = ['r1', 'r2', 'r3', 'r4', 'r5']

export default function SupremeCommandersPage() {
  const [commanders, setCommanders] = useState<Commander[]>([])
  const [alliances,  setAlliances]  = useState<Alliance[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [removing,   setRemoving]   = useState<string | null>(null)
  const [confirmUid, setConfirmUid] = useState<string | null>(null)

  // Add Commander form state
  const [showAdd,    setShowAdd]    = useState(false)
  const [newUid,     setNewUid]     = useState('')
  const [newName,    setNewName]    = useState('')
  const [newRole,    setNewRole]    = useState('r1')
  const [newAlliance,setNewAlliance]= useState('')
  const [adding,     setAdding]     = useState(false)
  const [addError,   setAddError]   = useState('')

  const load = async () => {
    setLoading(true)
    const [cRes, aRes] = await Promise.all([
      fetch('/api/supreme/commanders'),
      fetch('/api/supreme/alliances'),
    ])
    const cData = await cRes.json()
    const aData = await aRes.json()
    setCommanders(cData.commanders ?? [])
    setAlliances(aData.alliances ?? [])
    if (!newAlliance && aData.alliances?.length) setNewAlliance(aData.alliances[0].id)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetAddForm = () => {
    setNewUid(''); setNewName(''); setNewRole('r1')
    setNewAlliance(alliances[0]?.id ?? '')
    setAddError('')
  }

  const openAdd = () => { resetAddForm(); setShowAdd(true) }
  const closeAdd = () => { setShowAdd(false); setAddError('') }

  const handleAdd = async () => {
    if (!newUid.trim() || !newName.trim()) { setAddError('UID and Name are required.'); return }
    if (!newAlliance) { setAddError('Select an alliance.'); return }
    setAdding(true); setAddError('')
    try {
      const res = await fetch('/api/supreme/commanders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid:         newUid.trim(),
          name:        newName.trim(),
          role:        newRole,
          alliance_id: newAlliance,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error ?? 'Failed to add commander'); return }
      closeAdd()
      await load()
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (uid: string) => {
    setRemoving(uid)
    try {
      const res = await fetch('/api/supreme/commanders', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid }),
      })
      if (res.ok) {
        setCommanders(prev => prev.filter(c => c.uid !== uid))
      }
    } finally {
      setRemoving(null)
      setConfirmUid(null)
    }
  }

  const filtered = commanders.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.uid.toLowerCase().includes(search.toLowerCase()) ||
    (c.alliance_tag ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const ROLE_COLOR: Record<string, string> = {
    supreme: 'badge-active',
    r5:      'badge-active',
    r4:      'badge-warning',
    r3:      'badge-warning',
    r2:      'badge-inactive',
    r1:      'badge-inactive',
  }

  const VERIFY_COLOR: Record<string, string> = {
    linked:    'badge-active',
    verified:  'badge-warning',
    code_sent: 'badge-warning',
    pending:   'badge-inactive',
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in min-w-0">

      {/* Header */}
      <div className="glass-card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-tactical-900">Commanders</h1>
          <p className="text-[11px] text-tactical-500 mt-0.5">
            {commanders.length} total · {commanders.filter(c => c.verification_status === 'linked').length} linked
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary text-xs sm:text-sm shrink-0 px-3 py-2">
          + Add
        </button>
      </div>

      {/* Search */}
      <div className="glass-card p-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, UID or alliance tag…"
          className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                     bg-white text-tactical-900 focus:outline-none focus:border-accent"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-tactical-400">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-tactical-400">No commanders found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(c => (
            <div key={c.uid} className="glass-card p-3">
              <div className="flex items-center justify-between gap-3">
                {/* Avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-accent-light flex items-center
                                  justify-center shrink-0">
                    <span className="text-sm font-bold text-accent-deep">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-tactical-900 text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-tactical-500 font-mono truncate">{c.uid}</p>
                  </div>
                </div>

                {/* Remove button */}
                {confirmUid === c.uid ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-600 font-medium">Remove?</span>
                    <button
                      onClick={() => handleRemove(c.uid)}
                      disabled={removing === c.uid}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600
                                 text-white hover:bg-red-700 transition-colors"
                    >
                      {removing === c.uid ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmUid(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay
                                 text-tactical-700 hover:bg-tactical-100 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmUid(c.uid)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200
                               text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`badge ${ROLE_COLOR[c.role] ?? 'badge-inactive'}`}>
                  {c.role}
                </span>
                <span className={`badge ${VERIFY_COLOR[c.verification_status] ?? 'badge-inactive'}`}>
                  {c.verification_status}
                </span>
                {c.alliance_tag && (
                  <span className="badge badge-inactive font-mono">[{c.alliance_tag}]</span>
                )}
                {c.linked_google_uid && (
                  <span className="text-xs text-tactical-400">
                    🔗 Google linked
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Commander modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)' }}
        >
          <div className="glass-card-raised w-full sm:max-w-sm max-h-[85vh] overflow-y-auto
                           rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4">
            <h2 className="font-semibold text-tactical-900">Add Commander</h2>

            <div>
              <label className="text-xs font-medium text-tactical-600 mb-1 block">
                Commander UID <span className="text-red-500">*</span>
              </label>
              <input
                value={newUid}
                onChange={e => setNewUid(e.target.value)}
                placeholder="e.g. 123456789"
                className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                           bg-white text-tactical-900 focus:outline-none focus:border-accent font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-tactical-600 mb-1 block">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Commander name"
                className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                           bg-white text-tactical-900 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-tactical-600 mb-1 block">
                Alliance <span className="text-red-500">*</span>
              </label>
              <select
                value={newAlliance}
                onChange={e => setNewAlliance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                           bg-white text-tactical-900 focus:outline-none focus:border-accent"
              >
                {alliances.length === 0 && <option value="">No alliances available</option>}
                {alliances.map(a => (
                  <option key={a.id} value={a.id}>[{a.tag}] {a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-tactical-600 mb-1 block">Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-tactical-200 text-sm
                           bg-white text-tactical-900 focus:outline-none focus:border-accent"
              >
                {ROLES.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
            </div>

            {addError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <p className="text-xs text-red-700">{addError}</p>
              </div>
            )}

            <div className="flex gap-3 pb-1">
              <button onClick={closeAdd} disabled={adding}
                      className="flex-1 px-4 py-2 rounded-xl border border-tactical-200
                                 text-sm font-medium text-tactical-600 hover:bg-tactical-50">
                Cancel
              </button>
              <button onClick={handleAdd} disabled={adding}
                      className="flex-1 btn-primary text-sm">
                {adding ? 'Adding…' : 'Add Commander'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}