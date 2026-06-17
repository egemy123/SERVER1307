// app/(protected)/alliance/[id]/duel/entry/page.tsx
'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter }         from 'next/navigation'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES } from '@/lib/types'
import type { DuelDay }                 from '@/lib/types'

const DAYS: DuelDay[] = ['monday','tuesday','wednesday','thursday','friday','saturday']

interface Commander { uid: string; name: string }
interface DuelWeek  { id: string; mode: string; minimum_score: number | null; week_key: string }
interface DuelEntry {
  commander_uid: string; day: DuelDay
  status: string; day_locked: boolean
}

export default function DuelEntryPage() {
  const params     = useParams()
  const router     = useRouter()
  const allianceId = params.id as string

  const [members,    setMembers]    = useState<Commander[]>([])
  const [duelWeek,   setDuelWeek]   = useState<DuelWeek | null>(null)
  const [entries,    setEntries]    = useState<DuelEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')
  const [activeDay,  setActiveDay]  = useState<DuelDay>('monday')

  // Quick entry state
  const [minScore,      setMinScore]      = useState('')
  const [participated,  setParticipated]  = useState<Set<string>>(new Set())
  const [belowMinimum,  setBelowMinimum]  = useState<Set<string>>(new Set())
  const [search1,       setSearch1]       = useState('')
  const [search2,       setSearch2]       = useState('')

  // Mode selection for new week
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [selectedMode,   setSelectedMode]   = useState<'quick'|'full'>('quick')

  useEffect(() => { fetchData() }, [allianceId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/duel/week?alliance_id=${allianceId}`)
      const data = await res.json()
      setMembers(data.members ?? [])
      setDuelWeek(data.week ?? null)
      setEntries(data.entries ?? [])
      if (!data.week) setShowModeSelect(true)
    } catch { setMsg('Failed to load data') }
    finally   { setLoading(false) }
  }

  const currentDayEntries  = entries.filter(e => e.day === activeDay)
  const isDayLocked        = currentDayEntries.some(e => e.day_locked)

  // Pre-populate chips if day already has entries
  useEffect(() => {
    if (!isDayLocked) {
      setParticipated(new Set())
      setBelowMinimum(new Set())
      return
    }
    const p = new Set(currentDayEntries.filter(e => e.status !== 'absent').map(e => e.commander_uid))
    const b = new Set(currentDayEntries.filter(e => e.status === 'below_minimum').map(e => e.commander_uid))
    setParticipated(p)
    setBelowMinimum(b)
  }, [activeDay, entries])

  // Auto-calculated results
  const passed  = useMemo(() => [...participated].filter(uid => !belowMinimum.has(uid)), [participated, belowMinimum])
  const absent  = useMemo(() => members.filter(m => !participated.has(m.uid)).map(m => m.uid), [members, participated])

  // Filtered lists for search
  const slot1List = useMemo(() =>
    members.filter(m => m.name.toLowerCase().includes(search1.toLowerCase())),
    [members, search1]
  )
  const slot2List = useMemo(() =>
    members.filter(m => participated.has(m.uid) && m.name.toLowerCase().includes(search2.toLowerCase())),
    [members, participated, search2]
  )

  const handleStartWeek = async () => {
    setSaving(true); setMsg('')
    try {
      const res  = await fetch('/api/duel/week', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ alliance_id: allianceId, mode: selectedMode }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setShowModeSelect(false)
      fetchData()
    } catch { setMsg('Failed to start week') }
    finally   { setSaving(false) }
  }

  const handleLockDay = async () => {
    if (!duelWeek) return
    if (!minScore && duelWeek.mode === 'quick') {
      setMsg('Set minimum score first'); return
    }
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/duel/lock-day', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          duel_week_id:  duelWeek.id,
          day:           activeDay,
          minimum_score: minScore ? parseInt(minScore) : null,
          participated:  [...participated],
          below_minimum: [...belowMinimum],
          absent,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg(`${activeDay} locked successfully`)
      fetchData()
    } catch { setMsg('Failed to lock day') }
    finally   { setSaving(false) }
  }

  const toggleParticipated = (uid: string) => {
    if (isDayLocked) return
    setParticipated(prev => {
      const next = new Set(prev)
      if (next.has(uid)) {
        next.delete(uid)
        setBelowMinimum(bm => { const b = new Set(bm); b.delete(uid); return b })
      } else {
        next.add(uid)
      }
      return next
    })
  }

  const toggleBelow = (uid: string) => {
    if (isDayLocked) return
    setBelowMinimum(prev => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      </div>
    )
  }

  // Mode selection screen
  if (showModeSelect) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in max-w-lg">
        <div className="page-header">
          <h1 className="page-title">Start Duel Week</h1>
          <p className="page-subtitle">Choose entry mode for this week</p>
        </div>
        {msg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{msg}</div>
        )}
        <div className="grid grid-cols-1 gap-3">
          {([
            { mode: 'quick', title: 'Quick Entry', desc: 'Select who participated and who scored below minimum. Absences are auto-calculated. No exact scores stored.' },
            { mode: 'full',  title: 'Full Manual Entry', desc: 'Enter exact scores for every member every day. Generates leaderboards, rankings, and MVP calculations.' },
          ] as const).map(opt => (
            <button
              key={opt.mode}
              onClick={() => setSelectedMode(opt.mode)}
              className={`glass-card p-5 text-left transition-all duration-150 border-2 ${
                selectedMode === opt.mode
                  ? 'border-accent bg-accent-light/50'
                  : 'border-transparent hover:border-tactical-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-tactical-900">{opt.title}</p>
                {selectedMode === opt.mode && <span className="badge badge-active text-xs">Selected</span>}
              </div>
              <p className="text-sm text-tactical-500">{opt.desc}</p>
            </button>
          ))}
        </div>
        <button onClick={handleStartWeek} disabled={saving} className="btn-primary w-full">
          {saving ? 'Starting...' : 'Start This Week →'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Duel Entry</h1>
          <p className="page-subtitle">
            {duelWeek?.week_key} · <span className="capitalize">{duelWeek?.mode}</span> mode
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msg.includes('success') || msg.includes('locked')
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Day selector tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(day => {
          const dayEntries = entries.filter(e => e.day === day)
          const locked     = dayEntries.some(e => e.day_locked)
          return (
            <button
              key={day}
              onClick={() => { setActiveDay(day); setSearch1(''); setSearch2('') }}
              className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium
                         whitespace-nowrap transition-all shrink-0 border
                         ${activeDay === day
                           ? 'bg-accent text-white border-accent'
                           : locked
                           ? 'bg-accent-light text-accent-deep border-accent/30'
                           : 'bg-white/70 text-tactical-500 border-tactical-200 hover:border-tactical-300'
                         }`}
            >
              <span className="capitalize">{day.slice(0,3)}</span>
              <span className="font-mono mt-0.5">+{DUEL_POINT_VALUES[day]}pt</span>
              {locked && <span className="text-[9px] mt-0.5">✓ locked</span>}
            </button>
          )
        })}
      </div>

      {/* Day entry panel */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-tactical-900 capitalize">{DUEL_DAY_NAMES[activeDay]}</p>
            <p className="text-xs text-tactical-500 mt-0.5">
              {isDayLocked ? '✓ Day locked' : `${members.length} members`}
            </p>
          </div>
          {isDayLocked && (
            <span className="badge badge-active">Locked</span>
          )}
        </div>

        {duelWeek?.mode === 'quick' && !isDayLocked && (
          <>
            {/* Minimum score input */}
            <div className="mb-4">
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">
                Minimum required score
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={minScore}
                  onChange={e => setMinScore(e.target.value)}
                  placeholder="e.g. 20000000"
                  className="input-base font-mono flex-1"
                />
                {minScore && (
                  <span className="badge badge-active font-mono shrink-0">
                    {(parseInt(minScore) / 1_000_000).toFixed(0)}M
                  </span>
                )}
              </div>
            </div>

            {/* SLOT 1 — Participated */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-tactical-900">
                  Slot 1 — Participated
                </p>
                <div className="flex items-center gap-2">
                  <span className="badge badge-active">{participated.size}/{members.length}</span>
                  <button onClick={() => setParticipated(new Set(members.map(m => m.uid)))}
                          className="btn-ghost text-xs py-1 px-2">All</button>
                  <button onClick={() => { setParticipated(new Set()); setBelowMinimum(new Set()) }}
                          className="btn-ghost text-xs py-1 px-2">Clear</button>
                </div>
              </div>
              <input
                type="text"
                placeholder="Search commander..."
                value={search1}
                onChange={e => setSearch1(e.target.value)}
                className="input-base mb-2 text-xs"
              />
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {slot1List.map(m => (
                  <button
                    key={m.uid}
                    onClick={() => toggleParticipated(m.uid)}
                    className={participated.has(m.uid) ? 'chip-participated' : 'chip-unselected'}
                  >
                    {participated.has(m.uid) && <span>✓</span>}
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* SLOT 2 — Below Minimum (only from Slot 1) */}
            {participated.size > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-tactical-900">
                    Slot 2 — Below Minimum
                  </p>
                  <span className="badge badge-warning">{belowMinimum.size} selected</span>
                </div>
                <p className="text-xs text-tactical-500 mb-2">
                  Select who scored below minimum from the {participated.size} who participated
                </p>
                <input
                  type="text"
                  placeholder="Search participated..."
                  value={search2}
                  onChange={e => setSearch2(e.target.value)}
                  className="input-base mb-2 text-xs"
                />
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {slot2List.map(m => (
                    <button
                      key={m.uid}
                      onClick={() => toggleBelow(m.uid)}
                      className={belowMinimum.has(m.uid) ? 'chip-below' : 'chip-unselected'}
                    >
                      {belowMinimum.has(m.uid) && <span>⚠</span>}
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 rounded-xl bg-accent-light">
                <p className="text-2xl font-bold text-accent-deep">{passed.length}</p>
                <p className="text-xs text-accent-mid mt-0.5">Passed</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-50">
                <p className="text-2xl font-bold text-amber-700">{belowMinimum.size}</p>
                <p className="text-xs text-amber-600 mt-0.5">Below Min</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-50">
                <p className="text-2xl font-bold text-red-600">{absent.length}</p>
                <p className="text-xs text-red-500 mt-0.5">Absent</p>
              </div>
            </div>

            <button
              onClick={handleLockDay}
              disabled={saving || !minScore}
              className="btn-primary w-full"
            >
              {saving ? 'Locking...' : 'Submit & Lock Day ✓'}
            </button>
          </>
        )}

        {/* Locked day view */}
        {isDayLocked && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-accent-light">
                <p className="text-2xl font-bold text-accent-deep">
                  {currentDayEntries.filter(e => e.status === 'passed').length}
                </p>
                <p className="text-xs text-accent-mid mt-0.5">Passed</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-50">
                <p className="text-2xl font-bold text-amber-700">
                  {currentDayEntries.filter(e => e.status === 'below_minimum').length}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Below Min</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-50">
                <p className="text-2xl font-bold text-red-600">
                  {currentDayEntries.filter(e => e.status === 'absent').length}
                </p>
                <p className="text-xs text-red-500 mt-0.5">Absent</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-accent-light border border-accent/20 text-center">
              <p className="text-xs text-accent-deep">
                Day locked — no further edits permitted
              </p>
            </div>
          </div>
        )}

        {duelWeek?.mode === 'full' && !isDayLocked && (
          <div className="text-center py-6">
            <p className="text-sm text-tactical-500">Full manual entry coming in next update.</p>
          </div>
        )}
      </div>
    </div>
  )
}