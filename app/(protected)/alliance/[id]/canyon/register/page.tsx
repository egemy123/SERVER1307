// app/(protected)/alliance/[id]/canyon/register/page.tsx
'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter }         from 'next/navigation'

interface Commander { uid: string; name: string }
interface CanyonEvent {
  id: string; state: string
  tfa_side: string | null; tfa_slot: string | null
  tfb_side: string | null; tfb_slot: string | null
  tfa_side_finalized: boolean; tfb_side_finalized: boolean
  tfa_finalized: boolean; tfb_finalized: boolean
}
interface RosterEntry { commander_uid: string; task_force: string; roster_role: string }

const SLOTS = ['12:00','23:00']
const SIDES = ['rulebringers','dawnbreakers'] as const
const SIDE_COLOR: Record<string, string> = {
  rulebringers: 'bg-blue-50 border-blue-400 text-blue-700',
  dawnbreakers: 'bg-purple-50 border-purple-400 text-purple-700',
}

export default function CanyonRegisterPage() {
  const params     = useParams()
  const router     = useRouter()
  const allianceId = params.id as string

  const [members,   setMembers]   = useState<Commander[]>([])
  const [event,     setEvent]     = useState<CanyonEvent | null>(null)
  const [roster,    setRoster]    = useState<RosterEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState('')
  const [activeTab, setActiveTab] = useState<'A'|'B'>('A')
  const [search,    setSearch]    = useState('')

  useEffect(() => { fetchData() }, [allianceId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/canyon/event?alliance_id=${allianceId}`)
      const data = await res.json()
      setMembers(data.members ?? [])
      setEvent(data.event ?? null)
      setRoster(data.roster ?? [])
    } catch { setMsg('Failed to load') }
    finally   { setLoading(false) }
  }

  const tfRoster    = roster.filter(r => r.task_force === activeTab)
  const tfStarters  = tfRoster.filter(r => r.roster_role === 'starter').map(r => r.commander_uid)
  const tfSubs      = tfRoster.filter(r => r.roster_role === 'substitute').map(r => r.commander_uid)
  const allAssigned = new Set(roster.map(r => r.commander_uid))
  const isFinalized = activeTab === 'A' ? event?.tfa_finalized : event?.tfb_finalized
  const isSideFinalized = activeTab === 'A' ? event?.tfa_side_finalized : event?.tfb_side_finalized
  const currentSlot = activeTab === 'A' ? event?.tfa_slot : event?.tfb_slot
  const currentSide = activeTab === 'A' ? event?.tfa_side : event?.tfb_side

  const available = useMemo(() =>
    members.filter(m =>
      !allAssigned.has(m.uid) &&
      m.name.toLowerCase().includes(search.toLowerCase())
    ), [members, allAssigned, search])

  const handleSetSide = async (side: string) => {
    if (!event || isSideFinalized || isFinalized) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/side', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, task_force: activeTab, side }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      fetchData()
    } catch { setMsg('Failed to set side') }
    finally { setSaving(false) }
  }

  const handleFinalizeSide = async () => {
    if (!event || !currentSide) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/side', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, task_force: activeTab }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      setMsg(`TF-${activeTab} side locked as ${currentSide}`)
      fetchData()
    } catch { setMsg('Failed to lock side') }
    finally { setSaving(false) }
  }

  const handleSetSlot = async (slot: string) => {
    if (!event || isFinalized) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/slot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, task_force: activeTab, slot }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      fetchData()
    } catch { setMsg('Failed to set slot') }
    finally { setSaving(false) }
  }

  const handleAddMember = async (uid: string, role: 'starter'|'substitute') => {
    if (!event) return
    if (role === 'starter'    && tfStarters.length >= 20) { setMsg('Max 20 starters'); return }
    if (role === 'substitute' && tfSubs.length     >= 10) { setMsg('Max 10 substitutes'); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, commander_uid: uid, task_force: activeTab, roster_role: role }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      fetchData()
    } catch { setMsg('Failed to add') }
    finally { setSaving(false) }
  }

  const handleRemoveMember = async (uid: string) => {
    if (!event || isFinalized) return
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/roster', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, commander_uid: uid }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      fetchData()
    } catch { setMsg('Failed to remove') }
    finally { setSaving(false) }
  }

  const handleFinalize = async () => {
    if (!event) return
    if (tfStarters.length !== 20) { setMsg('Need 20 starters'); return }
    if (tfSubs.length !== 10)     { setMsg('Need 10 substitutes'); return }
    if (!currentSlot)              { setMsg('Select a time slot'); return }
    if (!currentSide)              { setMsg('Select a battle side'); return }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/canyon/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, task_force: activeTab }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg(`Task Force ${activeTab} finalized`)
      fetchData()
    } catch { setMsg('Failed to finalize') }
    finally { setSaving(false) }
  }

  const getMemberName = (uid: string) => members.find(m => m.uid === uid)?.name ?? uid

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  if (!event) return (
    <div className="glass-card p-8 text-center">
      <p className="font-semibold text-tactical-900">No Canyon event this week</p>
      <button onClick={() => router.back()} className="btn-secondary mt-4">← Back</button>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Canyon Roster</h1>
          <p className="page-subtitle">Task Force builder · {members.length} available</p>
        </div>
        <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msg.includes('finalized') || msg.includes('locked')
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>{msg}</div>
      )}

      {/* TF Tabs */}
      <div className="flex gap-1 bg-surface-raised rounded-xl p-1 w-fit">
        {(['A','B'] as const).map(tf => (
          <button key={tf} onClick={() => { setActiveTab(tf); setSearch('') }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tf ? 'bg-white text-tactical-900 shadow-sm' : 'text-tactical-500'
            }`}>
            TF-{tf}
            {(tf === 'A' ? event.tfa_finalized : event.tfb_finalized) && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Side selector */}
      <div className="glass-card p-4">
        <p className="text-xs font-medium text-tactical-600 mb-2">
          Battle Side — TF-{activeTab}
          {isSideFinalized && <span className="ml-2 text-accent-deep font-semibold">· LOCKED</span>}
        </p>
        <div className="flex gap-2 mb-2">
          {SIDES.map(side => (
            <button key={side} onClick={() => handleSetSide(side)}
              disabled={!!isSideFinalized || !!isFinalized || saving}
              className={`chip capitalize ${currentSide === side ? SIDE_COLOR[side] : 'chip-unselected'}`}>
              {side}
            </button>
          ))}
        </div>
        {currentSide && !isSideFinalized && !isFinalized && (
          <button onClick={handleFinalizeSide} disabled={saving}
            className="btn-secondary text-xs py-1 px-3 mt-1">
            Lock Side ({currentSide})
          </button>
        )}
      </div>

      {/* Slot selector */}
      <div className="glass-card p-4">
        <p className="text-xs font-medium text-tactical-600 mb-2">Battle Time Slot (UTC-2) — TF-{activeTab}</p>
        <div className="flex gap-2">
          {SLOTS.map(slot => (
            <button key={slot} onClick={() => handleSetSlot(slot)}
              disabled={!!isFinalized || saving}
              className={`chip font-mono ${currentSlot === slot ? 'chip-participated' : 'chip-unselected'}`}>
              {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Roster builder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-tactical-900">Starters</p>
            <span className={`badge ${tfStarters.length === 20 ? 'badge-active' : 'badge-inactive'}`}>
              {tfStarters.length}/20
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-12">
            {tfStarters.map(uid => (
              <div key={uid} className="chip-participated group flex items-center gap-1">
                <span>{getMemberName(uid)}</span>
                {!isFinalized && (
                  <button onClick={() => handleRemoveMember(uid)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 ml-1 text-xs">×</button>
                )}
              </div>
            ))}
            {tfStarters.length === 0 && <p className="text-xs text-tactical-400 py-2">No starters yet</p>}
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-tactical-900">Substitutes</p>
            <span className={`badge ${tfSubs.length === 10 ? 'badge-active' : 'badge-inactive'}`}>
              {tfSubs.length}/10
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-12">
            {tfSubs.map(uid => (
              <div key={uid} className="chip-unselected group flex items-center gap-1">
                <span>{getMemberName(uid)}</span>
                {!isFinalized && (
                  <button onClick={() => handleRemoveMember(uid)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 ml-1 text-xs">×</button>
                )}
              </div>
            ))}
            {tfSubs.length === 0 && <p className="text-xs text-tactical-400 py-2">No substitutes yet</p>}
          </div>
        </div>
      </div>

      {/* Available pool */}
      {!isFinalized && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-tactical-900">Available Members</p>
            <span className="badge badge-inactive">{available.length}</span>
          </div>
          <input type="text" placeholder="Search members..." value={search}
            onChange={e => setSearch(e.target.value)} className="input-base mb-3 text-sm" />
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {available.map(m => (
              <div key={m.uid} className="flex items-center gap-1">
                <button onClick={() => handleAddMember(m.uid, 'starter')}
                  disabled={saving || tfStarters.length >= 20} className="chip-unselected text-xs">
                  +S {m.name}
                </button>
                <button onClick={() => handleAddMember(m.uid, 'substitute')}
                  disabled={saving || tfSubs.length >= 10}
                  className="chip bg-surface-overlay border-tactical-300 text-tactical-500 text-xs">
                  +Sub
                </button>
              </div>
            ))}
            {available.length === 0 && (
              <p className="text-xs text-tactical-400 py-4 w-full text-center">
                {search ? 'No matches' : 'All members assigned'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Finalize */}
      {!isFinalized ? (
        <button onClick={handleFinalize}
          disabled={saving || tfStarters.length !== 20 || tfSubs.length !== 10 || !currentSlot || !currentSide}
          className="btn-primary w-full justify-center py-3">
          {saving ? 'Finalizing...' : `Finalize TF-${activeTab} (${tfStarters.length}/20 · ${tfSubs.length}/10)`}
        </button>
      ) : (
        <div className="glass-card p-4 border border-accent/30 bg-accent-light/30 text-center">
          <p className="text-sm font-semibold text-accent-deep">
            ✓ Task Force {activeTab} finalized — no further edits
          </p>
        </div>
      )}
    </div>
  )
}