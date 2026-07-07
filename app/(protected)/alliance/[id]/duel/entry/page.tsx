'use client'
// app/(protected)/alliance/[id]/duel/entry/page.tsx
// Duel entry page.
//
// Simple Mode  → DualCascadeSelection (multi-chip selection). Unchanged
//                cascade logic, now with a 4th step for Alliance Result.
// Detailed Mode → leadership enters an actual score per commander; status
//                (passed/below_minimum/absent) is auto-derived, then the
//                same Victory/Defeat step is required before locking.
//
// IMPORTANT: in both modes, minimum-score performance (Passed/Below
// Minimum/Absent) is informational only and awards ZERO points.
// Victory/Defeat is the ONLY source of duel points, decided manually
// by leadership every time a day is locked.

import { useState, useEffect, useMemo }       from 'react'
import { useParams, useRouter }               from 'next/navigation'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES }  from '@/lib/types'
import type { DuelDay, DuelResult }           from '@/lib/types'
import DualCascadeSelection                   from '@/components/duel/DualCascadeSelection'

// ── Types ──────────────────────────────────────────────────────────────────────

const DAYS: DuelDay[] = ['monday','tuesday','wednesday','thursday','friday','saturday']

interface Commander { uid: string; name: string; role: 'r1'|'r2'|'r3'|'r4'|'r5' }
interface DuelWeek  { id: string; mode: string; minimum_score: number | null; week_key: string }
interface DuelEntry {
  commander_uid: string
  day: DuelDay
  status: 'passed' | 'below_minimum' | 'absent'
  score: number | null
  day_locked: boolean
}
interface DuelDayResultRow {
  day: DuelDay
  result: DuelResult
  minimum_score: number | null
}

interface CascadeResult {
  minimumPlayers:    string[]
  nonMinimumPlayers: string[]
  absentPlayers:     string[]
  result:            DuelResult
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DuelEntryPage() {
  const params     = useParams()
  const router      = useRouter()
  const allianceId = params.id as string

  const [members,        setMembers]        = useState<Commander[]>([])
  const [duelWeek,       setDuelWeek]       = useState<DuelWeek | null>(null)
  const [entries,        setEntries]        = useState<DuelEntry[]>([])
  const [dayResults,     setDayResults]     = useState<DuelDayResultRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [msg,            setMsg]            = useState('')
  const [activeDay,      setActiveDay]      = useState<DuelDay>('monday')
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [selectedMode,   setSelectedMode]   = useState<'quick'|'full'>('quick')
  const [minScore,       setMinScore]       = useState('')

  // Detailed Mode local state
  const [detailedScores, setDetailedScores] = useState<Record<string, string>>({})
  const [detailedStep,   setDetailedStep]   = useState<'scores' | 'result'>('scores')
  const [detailedResult, setDetailedResult] = useState<DuelResult | null>(null)

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
      setDayResults(data.day_results ?? [])
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
  const currentDayResult  = dayResults.find(r => r.day === activeDay)

  const getDayStats = (day: DuelDay) => {
    const dayEntries = entries.filter(e => e.day === day)
    const dr = dayResults.find(r => r.day === day)
    return {
      locked: dayEntries.some(e => e.day_locked),
      passed: dayEntries.filter(e => e.status === 'passed').length,
      below:  dayEntries.filter(e => e.status === 'below_minimum').length,
      absent: dayEntries.filter(e => e.status === 'absent').length,
      result: dr?.result ?? null,
    }
  }

  // Map local Commander shape → DualCascadeSelection's expected shape
  const cascadeMembers = members.map(m => ({
    id:          m.uid,
    uid:         m.uid,
    displayName: m.name,
    role:        m.role,
  }))

  // Sorted members for Detailed Mode grid (R5 first, matches cascade ordering)
  const roleOrder: Record<string, number> = { r5: 0, r4: 1, r3: 2, r2: 3, r1: 4 }
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5)),
    [members]
  )

  const minScoreNum = minScore ? parseInt(minScore) : (duelWeek?.minimum_score ?? 0)

  // Live preview of Detailed Mode status derived from entered scores
  const detailedPreview = useMemo(() => {
    let passed = 0, below = 0, absent = 0, entered = 0
    for (const m of sortedMembers) {
      const raw = detailedScores[m.uid]
      if (raw === undefined || raw === '') continue
      entered++
      const score = parseInt(raw) || 0
      if (score === 0) absent++
      else if (minScoreNum && score < minScoreNum) below++
      else passed++
    }
    return { passed, below, absent, entered, total: sortedMembers.length }
  }, [detailedScores, sortedMembers, minScoreNum])

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

  // Simple Mode — cascade now returns { ...classification, result }
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
          result:        result.result,
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

  // Detailed Mode — submit raw scores + manually chosen result
  const handleDetailedSubmit = async () => {
    if (!duelWeek) return
    if (!minScore) { setMsg('Set the minimum score before locking the day'); return }
    if (!detailedResult) { setMsg('Select Victory or Defeat before locking the day'); return }

    const scores = sortedMembers
      .filter(m => detailedScores[m.uid] !== undefined && detailedScores[m.uid] !== '')
      .map(m => ({ commander_uid: m.uid, score: parseInt(detailedScores[m.uid]) || 0 }))

    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/duel/lock-day', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          duel_week_id:  duelWeek.id,
          day:           activeDay,
          minimum_score: parseInt(minScore),
          scores,
          result:        detailedResult,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error); return }
      setMsg(`${activeDay} locked ✓`)
      setMinScore('')
      setDetailedScores({})
      setDetailedStep('scores')
      setDetailedResult(null)
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
              title: 'Simple Mode',
              desc:  'Multi-chip selection — tap who passed minimum, who fell short, then confirm Victory or Defeat. Absences auto-calculated.',
              icon:  '⚡',
            },
            {
              mode:  'full',
              title: 'Detailed Mode',
              desc:  'Enter exact scores for every member. Status auto-derived, then confirm Victory or Defeat. Generates a raw-score leaderboard.',
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
            {duelWeek?.week_key} · <span className="capitalize">{duelWeek?.mode === 'full' ? 'Detailed' : 'Simple'}</span> mode
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

      {/* Day selector tabs — Day 1-6 fixed weekly cycle */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map((day, i) => {
          const { locked, passed, absent, result } = getDayStats(day)
          return (
            <button
              key={day}
              onClick={() => { setActiveDay(day); setMsg(''); setDetailedStep('scores') }}
              className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium
                         whitespace-nowrap transition-all shrink-0 border
                         ${activeDay === day
                           ? 'bg-accent text-white border-accent'
                           : locked
                           ? 'bg-accent-light text-accent-deep border-accent/30'
                           : 'bg-white/70 text-tactical-500 border-tactical-200 hover:border-tactical-300'
                         }`}
            >
              <span>Day {i + 1}</span>
              <span className="font-mono mt-0.5">+{DUEL_POINT_VALUES[day]}pt</span>
              {locked
                ? <span className="text-[9px] mt-0.5">{result === 'victory' ? '🏆' : '💔'} {passed}p/{absent}a</span>
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
          {isDayLocked && (
            <span className={`badge ${currentDayResult?.result === 'victory' ? 'badge-active' : 'badge-inactive'}`}>
              {currentDayResult?.result === 'victory' ? '🏆 Victory' : '💔 Defeat'}
            </span>
          )}
        </div>

        {/* ── LOCKED DAY VIEW ── */}
        {isDayLocked && (() => {
          const { passed, below, absent } = getDayStats(activeDay)
          return (
            <div className="flex flex-col gap-3">
              <div className={`p-3 rounded-xl border text-center ${
                currentDayResult?.result === 'victory'
                  ? 'bg-accent-light border-accent/30'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-lg font-bold ${
                  currentDayResult?.result === 'victory' ? 'text-accent-deep' : 'text-red-600'
                }`}>
                  {currentDayResult?.result === 'victory'
                    ? `🏆 Victory — +${DUEL_POINT_VALUES[activeDay]} pts`
                    : '💔 Defeat — +0 pts'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-accent-light">
                  <p className="text-2xl font-bold text-accent-deep">{passed}</p>
                  <p className="text-xs text-accent-mid mt-0.5">Passed Min</p>
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
              <p className="text-xs text-tactical-500 text-center">
                Minimum-score performance above is participation-only and does not affect points.
              </p>
              <div className="p-3 rounded-xl bg-accent-light border border-accent/20 text-center">
                <p className="text-xs text-accent-deep">
                  Day locked — no further edits permitted
                </p>
              </div>
            </div>
          )
        })()}

        {/* ── SIMPLE MODE: cascade entry (multi-chip selection) ── */}
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
              minimumScore={minScoreNum}
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

        {/* ── DETAILED MODE: per-commander score entry ── */}
        {!isDayLocked && duelWeek?.mode === 'full' && (
          <div className="flex flex-col gap-5">

            {detailedStep === 'scores' && (
              <>
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
                      ⚠ Set minimum score before entering results
                    </p>
                  )}
                </div>

                {/* Live preview counter */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-2.5 rounded-xl bg-surface-overlay">
                    <p className="text-lg font-bold text-tactical-900">{detailedPreview.entered}/{detailedPreview.total}</p>
                    <p className="text-[10px] text-tactical-500 mt-0.5">Entered</p>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-accent-light">
                    <p className="text-lg font-bold text-accent-deep">{detailedPreview.passed}</p>
                    <p className="text-[10px] text-accent-mid mt-0.5">Passed Min</p>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-amber-50">
                    <p className="text-lg font-bold text-amber-700">{detailedPreview.below}</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Below Min</p>
                  </div>
                  <div className="text-center p-2.5 rounded-xl bg-red-50">
                    <p className="text-lg font-bold text-red-600">{detailedPreview.absent}</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Absent</p>
                  </div>
                </div>

                {/* Per-commander score grid — 2 cols mobile / 4 cols desktop */}
                <div className="glass-card p-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {sortedMembers.map(m => {
                      const raw   = detailedScores[m.uid] ?? ''
                      const score = raw === '' ? null : (parseInt(raw) || 0)
                      const status = score === null ? null
                        : score === 0 ? 'absent'
                        : (minScoreNum && score < minScoreNum) ? 'below_minimum'
                        : 'passed'
                      const ring = status === 'passed'        ? 'border-green-500/40 bg-green-500/5'
                                 : status === 'below_minimum'  ? 'border-amber-400/40 bg-amber-400/5'
                                 : status === 'absent'         ? 'border-red-500/40 bg-red-500/5'
                                 : 'border-tactical-200'
                      return (
                        <div key={m.uid} className={`rounded-lg border p-2 flex flex-col gap-1 ${ring}`}>
                          <p className="text-xs font-semibold text-tactical-900 truncate">{m.name}</p>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={raw}
                            onChange={e => setDetailedScores(prev => ({ ...prev, [m.uid]: e.target.value }))}
                            placeholder="0"
                            className="input-base font-mono text-xs py-1 px-2"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailedStep('result')}
                  disabled={!minScore}
                  className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next: Alliance Result →
                </button>
              </>
            )}

            {detailedStep === 'result' && (
              <>
                <div>
                  <h2 className="page-title">Today's Result</h2>
                  <p className="page-subtitle">
                    Select Victory or Defeat for the alliance. Independent of minimum-score
                    performance — the only thing that awards duel points.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailedResult('victory')}
                    className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-8 transition-all
                      ${detailedResult === 'victory'
                        ? 'border-accent bg-accent-light text-accent-deep'
                        : 'border-tactical-200 hover:border-tactical-300'}`}
                  >
                    <span className="text-3xl">🏆</span>
                    <span className="text-base font-bold">Victory</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailedResult('defeat')}
                    className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-8 transition-all
                      ${detailedResult === 'defeat'
                        ? 'border-red-500 bg-red-50 text-red-600'
                        : 'border-tactical-200 hover:border-tactical-300'}`}
                  >
                    <span className="text-3xl">💔</span>
                    <span className="text-base font-bold">Defeat</span>
                  </button>
                </div>

                {!detailedResult && (
                  <p className="text-xs text-amber-600 text-center">
                    ⚠ Select Victory or Defeat to finish locking this day
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailedStep('scores')}
                    className="flex-1 btn-secondary"
                  >
                    ← Edit Scores
                  </button>
                  <button
                    type="button"
                    onClick={handleDetailedSubmit}
                    disabled={!detailedResult || saving}
                    className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Locking…' : 'Confirm & Submit ✓'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}