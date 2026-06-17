// app/admin/alliances/page.tsx
'use client'
import { useState, useEffect } from 'react'

interface Alliance {
  id: string; tag: string; name: string
  status: string; r5_uid: string | null
  created_at: string
}
interface Commander { uid: string; name: string }

export default function AdminAlliancesPage() {
  const [alliances,  setAlliances]  = useState<Alliance[]>([])
  const [commanders, setCommanders] = useState<Commander[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')

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

  const handleSave = async () => {
    if (!form.tag.trim() || !form.name.trim()) {
      setMsg('Tag and name are required'); return
    }
    if (form.tag.length > 5) {
      setMsg('Tag must be 5 characters or less'); return
    }
    setSaving(true); setMsg('')
    try {
      const res  = await fetch('/api/admin/alliances', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tag:    form.tag.trim().toUpperCase(),
          name:   form.name.trim(),
          r5_uid: form.r5_uid || null,
        }),
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
          msg.includes('success')
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
              <label className="text-xs font-medium text-tactical-600 block mb-1">
                Alliance Tag * (max 5 chars)
              </label>
              <input
                className="input-base font-mono uppercase"
                placeholder="WIN5"
                maxLength={5}
                value={form.tag}
                onChange={e => setForm(f => ({ ...f, tag: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1">
                Alliance Name *
              </label>
              <input
                className="input-base"
                placeholder="Full alliance name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1">
                R5 Leader (optional)
              </label>
              <select
                className="input-base"
                value={form.r5_uid}
                onChange={e => setForm(f => ({ ...f, r5_uid: e.target.value }))}
              >
                <option value="">— Assign later —</option>
                {commanders.map(c => (
                  <option key={c.uid} value={c.uid}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
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
          {alliances.map(a => (
            <div key={a.id} className="glass-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-accent-light flex items-center justify-center">
                  <span className="font-bold text-accent-deep text-sm">[{a.tag}]</span>
                </div>
                <div>
                  <p className="font-semibold text-tactical-900">{a.name}</p>
                  <span className={`badge ${a.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {a.status}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-surface-overlay">
                  <p className="text-tactical-500">Alliance ID</p>
                  <p className="font-mono text-tactical-700 truncate mt-0.5">{a.id.slice(0, 8)}...</p>
                </div>
                <div className="p-2 rounded-lg bg-surface-overlay">
                  <p className="text-tactical-500">R5</p>
                  <p className="text-tactical-700 mt-0.5">
                    {commanders.find(c => c.uid === a.r5_uid)?.name ?? '— Not assigned —'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}