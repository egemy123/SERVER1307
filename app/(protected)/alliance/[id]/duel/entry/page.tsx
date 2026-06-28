'use client'
// app/(protected)/alliance/[id]/duel/entry/page.tsx
// Duel entry page — uses DualCascadeSelection for quick mode day entry.
// Full mode entry is a future update.

import { useState, useEffect }               from 'react'
import { useParams, useRouter }               from 'next/navigation'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES }  from '@/lib/types'
import type { DuelDay }                       from '@/lib/types'
import DualCascadeSelection                   from '@/components/duel/DualCascadeSelection'

// ── Types ──────────────────────────────────────────────────────────────────────

const DAYS: DuelDay[] = ['monday','tuesday','wednesday','thursday','friday','saturday']

interface Commander { uid: string; name: string; role: 'r1'|'r2'|'r3'|'r4'|'r5' }
interface DuelWeek  { id: string; mode: string; minimum_score: number | null; week_key: string }
interface DuelEntry {
  commander_uid: string
  day: DuelDay
  status: 'passed' | 'below_minimum' | 'absent'
  day_locked: boolean
}

interface CascadeResult {
  minimumPlayers:    string[]
  nonMinimumPlayers: string[]
  absentPlayers:     string[]
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DuelEntryPage() {
  const params     = useParams()
  const router     = useRouter()
  const allianceId = params.id as string

  const [members,        setMembers]        = useState<Commander[]>([])
  const [duelWeek,       setDuelWeek]       = useState<DuelWeek | null>(null)
  const [entries,        setEntries]        = useState<DuelEntry[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [msg,            setMsg]            = useState('')
  const [activeDay,      setActiveDay]      = useState<DuelDay>('monday')
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [selectedMode,   setSelectedMode]   = useState<'quick'|'full'>('quick')
  const [minScore,       setMinScore]       = useState('')

  // ── Data loading ───────────────────────────────────────────────────────────

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
    } catch {
      setMsg('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const currentDayEntries = entries.filter(e => e.day === activeDay)
  const isDayLocked       = currentDayEntries.some(e => e.day_locked)

  const getDayStats = (day: DuelDay) => {
    const dayEntries = entries.filter(e => e.day === day)
    return {
      locked: dayEntries.some(e => e.day_locked),
      passed: dayEntries.filter(e => e.status === 'passed').length,
      below:  dayEntries.filter(e => e.status === 'below_minimum').length,
      absent: dayEntries.filter(e => e.status === 'absent').length,
    }
  }

  // Map local Commander shape → DualCascadeSelection's expected shape
  const cascadeMembers = members.map(m => ({
    id:          m.uid,
    uid:         m.uid,
    displayName: m.name,
    role:        m.role,
  }))

  // ── Handlers ───────────────────────────────────────────────────────────────

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
    } catch {
      setMsg('Failed to start week')
    } finally {
      setSaving(false)
    }
  }

  const handleCascadeComplete = async (result: CascadeResult) => {
    if (!duelWeek) return
    if (!minScore) { setMsg('Set the minimum score before locking the day'); return }

    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/duel/lock-day', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          duel_week_id:  duelWeek.id,
          day:           activeDay,
          minimum_score: parseInt(minScore),
          participated:  [...result.minimumPlayers, ...result.nonMinimumPlayers],
          below_minimum: result.nonMinimumPlayers,
          absent:        result.absentPlayers,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg(`${activeDay} locked ✓`)
      setMinScore('')
      fetchData()
    } catch {
      setMsg('Failed to lock day')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

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

  // ── Mode selection ─────────────────────────────────────────────────────────

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
            {
              mode:  'quick',
              title: 'Quick Entry',
              desc:  'Select who participated and who scored below minimum. Absences are auto-calculated.',
              icon:  '⚡',
            },
            {
              mode:  'full',
              title: 'Full Manual Entry',
              desc:  'Enter exact scores for every member. Generates leaderboards and MVP calculations.',
              icon:  '📊',
            },
          ] as const).map(opt => (
            <button
              key={opt.mode}
              onClick={() => setSelectedMode(opt.mode)}
              className="glass-card p-5 text-left transition-all duration-150"
              style={selectedMode === opt.mode ? {
                border:     '2px solid #22C55E',
                background: 'rgba(220,252,231,0.5)',
                boxShadow:  '0 0 0 4px rgba(34,197,94,0.15)',
              } : {
                border: '2px solid transparent',
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{opt.icon}</span>
                <p className="font-semibold text-tactical-900">{opt.title}</p>
                {selectedMode === opt.mode && (
                  <span className="badge badge-active text-xs ml-auto">Selected</span>
                )}
              </div>
              <p className="text-sm text-tactical-500">{opt.desc}</p>
            </button>
          ))}
        </div>

        <button onClick={handleStartWeek} disabled={saving} className="btn-primary w-full">
          {saving ? 'Starting…' : 'Start This Week →'}
        </button>
      </div>
    )
  }

  // ── Main entry page ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Duel Entry</h1>
          <p className="page-subtitle">
            {duelWeek?.week_key} · <span className="capitalize">{duelWeek?.mode}</span> mode
          </p>
        </div>
        <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
      </div>

      {/* Status message */}
      {msg && (
        <div className={`p-3 rounded-xl text-sm border animate-fade-in ${
          msg.includes('✓') || msg.includes('locked')
            ? 'bg-accent-light border-accent/30 text-accent-deep'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg}
        </div>
      )}

      {/* Day selector tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(day => {
          const { locked, passed, absent } = getDayStats(day)
          return (
            <button
              key={day}
              onClick={() => { setActiveDay(day); setMsg('') }}
              className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium
                         whitespace-nowrap transition-all shrink-0 border
                         ${activeDay === day
                           ? 'bg-accent text-white border-accent'
                           : locked
                           ? 'bg-accent-light text-accent-deep border-accent/30'
                           : 'bg-white/70 text-tactical-500 border-tactical-200 hover:border-tactical-300'
                         }`}
            >
              <span className="capitalize">{day.slice(0, 3)}</span>
              <span className="font-mono mt-0.5">+{DUEL_POINT_VALUES[day]}pt</span>
              {locked
                ? <span className="text-[9px] mt-0.5">✓ {passed}p/{absent}a</span>
                : <span className="text-[9px] mt-0.5 opacity-0">·</span>
              }
            </button>
          )
        })}
      </div>

      {/* Day content panel */}
      <div className="glass-card p-5">

        {/* Day header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-tactical-900 capitalize">
              {DUEL_DAY_NAMES[activeDay]}
            </p>
            <p className="text-xs text-tactical-500 mt-0.5">
              {isDayLocked
                ? '✓ Day locked — results recorded'
                : `${members.length} active members`
              }
            </p>
          </div>
          {isDayLocked && <span className="badge badge-active">Locked</span>}
        </div>

        {/* ── LOCKED DAY VIEW ── */}
        {isDayLocked && (() => {
          const { passed, below, absent } = getDayStats(activeDay)
          return (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-accent-light">
                  <p className="text-2xl font-bold text-accent-deep">{passed}</p>
                  <p className="text-xs text-accent-mid mt-0.5">Passed</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-amber-50">
                  <p className="text-2xl font-bold text-amber-700">{below}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Below Min</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-red-50">
                  <p className="text-2xl font-bold text-red-600">{absent}</p>
                  <p className="text-xs text-red-500 mt-0.5">Absent</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-accent-light border border-accent/20 text-center">
                <p className="text-xs text-accent-deep">
                  Day locked — no further edits permitted
                </p>
              </div>
            </div>
          )
        })()}

        {/* ── QUICK MODE: cascade entry ── */}
        {!isDayLocked && duelWeek?.mode === 'quick' && (
          <div className="flex flex-col gap-5">

            {/* Minimum score input */}
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">
                Minimum required score for {DUEL_DAY_NAMES[activeDay]}
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
              {!minScore && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ Set minimum score before locking the day
                </p>
              )}
            </div>

            {/* Cascade selection — members mapped to DualCascadeSelection's shape */}
            <DualCascadeSelection
              members={cascadeMembers}
              minimumScore={minScore ? parseInt(minScore) : (duelWeek?.minimum_score ?? 0)}
              onComplete={handleCascadeComplete}
            />

            {/* Saving overlay */}
            {saving && (
              <div className="p-3 rounded-xl bg-accent-light border border-accent/30 text-sm text-accent-deep text-center animate-pulse">
                Locking day…
              </div>
            )}
          </div>
        )}

        {/* ── FULL MODE placeholder ── */}
        {!isDayLocked && duelWeek?.mode === 'full' && (
          <div className="text-center py-8">
            <p className="text-2xl mb-2">📊</p>
            <p className="text-sm font-medium text-tactical-700">Full manual entry</p>
            <p className="text-sm text-tactical-500 mt-1">Coming in next update.</p>
          </div>
        )}

      </div>
    </div>
  )
}