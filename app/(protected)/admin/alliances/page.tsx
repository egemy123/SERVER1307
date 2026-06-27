// app/admin/alliances/page.tsx
'use client'
import { useState, useEffect } from 'react'

interface Alliance {
  id: string; tag: string; name: string
  status: string; r5_uid: string | null
  created_at: string
}
interface Commander { uid: string; name: string; alliance_id: string | null; role: string }

export default function AdminAlliancesPage() {
  const [alliances,  setAlliances]  = useState<Alliance[]>([])
  const [commanders, setCommanders] = useState<Commander[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')

  // Change R5 state
  const [changingR5,    setChangingR5]    = useState<string | null>(null) // alliance id
  const [newR5Uid,      setNewR5Uid]      = useState('')

  // Disband confirm state
  const [disbanding,    setDisbanding]    = useState<string | null>(null) // alliance id

  const [form, setForm] = useState({ tag: '', name: '', r5_uid: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/alliances')
    const data = await res.json()
    setAlliances(data.alliances ?? [])
    setCommanders(data.commanders ?? [])
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!form.tag.trim() || !form.name.trim()) { setMsg('Tag and name are required'); return }
    if (form.tag.length > 5) { setMsg('Tag must be 5 characters or less'); return }
    setSaving(true); setMsg('')
    try {
      const res  = await fetch('/api/admin/alliances', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: form.tag.trim().toUpperCase(), name: form.name.trim(), r5_uid: form.r5_uid || null }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg('Alliance created successfully')
      setShowForm(false)
      setForm({ tag: '', name: '', r5_uid: '' })
      fetchData()
    } catch { setMsg('Failed to create alliance') }
    finally  { setSaving(false) }
  }

  const handleChangeR5 = async (allianceId: string) => {
    if (!newR5Uid) { setMsg('Select a commander first'); return }
    setSaving(true); setMsg('')
    try {
      const res  = await fetch('/api/admin/alliances', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: allianceId, action: 'change_r5', r5_uid: newR5Uid }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg('R5 updated successfully')
      setChangingR5(null); setNewR5Uid('')
      fetchData()
    } catch { setMsg('Failed to change R5') }
    finally  { setSaving(false) }
  }

  const handleDisband = async (allianceId: string) => {
    setSaving(true); setMsg('')
    try {
      const res  = await fetch('/api/admin/alliances', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: allianceId, action: 'disband' }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg('Alliance disbanded — all members unassigned')
      setDisbanding(null)
      fetchData()
    } catch { setMsg('Failed to disband alliance') }
    finally  { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Alliances</h1>
          <p className="page-subtitle">{alliances.length} alliances</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? 'Cancel' : '+ New Alliance'}
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msg.includes('success') || msg.includes('disbanded')
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="glass-card p-5 flex flex-col gap-4 animate-slide-up">
          <p className="font-semibold text-tactical-900">Create New Alliance</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1">Alliance Tag * (max 5)</label>
              <input className="input-base font-mono uppercase" placeholder="WIN5" maxLength={5}
                value={form.tag} onChange={e => setForm(f => ({ ...f, tag: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1">Alliance Name *</label>
              <input className="input-base" placeholder="Full alliance name"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1">R5 Leader (optional)</label>
              <select className="input-base" value={form.r5_uid}
                onChange={e => setForm(f => ({ ...f, r5_uid: e.target.value }))}>
                <option value="">— Assign later —</option>
                {commanders.map(c => (
                  <option key={c.uid} value={c.uid}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? 'Creating...' : 'Create Alliance'}
            </button>
          </div>
        </div>
      )}

      {/* Alliance cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      ) : alliances.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-tactical-400 text-sm">No alliances yet. Create the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {alliances.map(a => {
            const allianceMembers = commanders.filter(c => c.alliance_id === a.id)
            const currentR5       = commanders.find(c => c.uid === a.r5_uid)
            const isChangingR5    = changingR5 === a.id
            const isDisbanding    = disbanding === a.id

            return (
              <div key={a.id} className={`glass-card p-5 flex flex-col gap-4 ${a.status === 'inactive' ? 'opacity-60' : ''}`}>

                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center shrink-0">
                    <span className="font-bold text-accent-deep text-sm">[{a.tag}]</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-tactical-900">{a.name}</p>
                    <span className={`badge ${a.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                      {a.status}
                    </span>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-surface-overlay">
                    <p className="text-tactical-500">R5 Leader</p>
                    <p className="text-tactical-800 font-medium mt-0.5">
                      {currentR5?.name ?? '— Not assigned —'}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-overlay">
                    <p className="text-tactical-500">Members</p>
                    <p className="text-tactical-800 font-medium mt-0.5">{allianceMembers.length}</p>
                  </div>
                </div>

                {/* Actions — only for active alliances */}
                {a.status === 'active' && (
                  <div className="flex flex-col gap-3 pt-1 border-t border-tactical-100">

                    {/* Change R5 */}
                    {isChangingR5 ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-tactical-600">Select new R5:</p>
                        <select className="input-base text-sm" value={newR5Uid}
                          onChange={e => setNewR5Uid(e.target.value)}>
                          <option value="">— Choose commander —</option>
                          {allianceMembers
                            .filter(c => c.uid !== a.r5_uid)
                            .map(c => (
                              <option key={c.uid} value={c.uid}>
                                {c.name} ({c.role.toUpperCase()})
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => { setChangingR5(null); setNewR5Uid('') }}
                            className="btn-secondary text-xs py-1.5 flex-1">Cancel</button>
                          <button onClick={() => handleChangeR5(a.id)} disabled={saving || !newR5Uid}
                            className="btn-primary text-xs py-1.5 flex-1">
                            {saving ? 'Saving...' : 'Confirm R5 Change'}
                          </button>
                        </div>
                        <p className="text-xs text-tactical-400">Current R5 will be demoted to R4.</p>
                      </div>
                    ) : isDisbanding ? (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                          <p className="text-xs font-semibold text-red-700">⚠ Disband [{a.tag}]?</p>
                          <p className="text-xs text-red-600 mt-1">
                            All {allianceMembers.length} members will be unassigned and reset to R1.
                            This cannot be undone.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setDisbanding(null)}
                            className="btn-secondary text-xs py-1.5 flex-1">Cancel</button>
                          <button onClick={() => handleDisband(a.id)} disabled={saving}
                            className="text-xs py-1.5 flex-1 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                            {saving ? 'Disbanding...' : 'Confirm Disband'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setChangingR5(a.id); setDisbanding(null) }}
                          className="btn-secondary text-xs py-1.5 flex-1">
                          Change R5
                        </button>
                        <button onClick={() => { setDisbanding(a.id); setChangingR5(null) }}
                          className="text-xs py-1.5 flex-1 rounded-xl font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                          Disband
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}