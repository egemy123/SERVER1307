'use client'

/**
 * DualCascadeSelection
 * ─────────────────────────────────────────────────────────────
 * Four-step cascade for weekly Dual attendance classification.
 * Step 1 → Minimum Score achieved           (Commander Performance Track)
 * Step 2 → Participated but below minimum   (Commander Performance Track)
 * Step 3 → Summary                          (Commander Performance Track)
 * Step 4 → Alliance Result: Victory/Defeat  (Alliance Victory Track)
 *
 * IMPORTANT: Steps 1-3 (minimum/below-minimum/absent) are the
 * Commander Performance Track. They are used ONLY for participation
 * monitoring, warnings, and analytics — they award ZERO duel points.
 *
 * Step 4 is the Alliance Victory Track. It is a separate, manual
 * decision by leadership and is the ONLY thing that determines
 * duel points for the day. It is never inferred from steps 1-3.
 *
 * Member grid is dense (2 cols mobile / 4 cols desktop) so a
 * 100-member alliance stays scannable without endless scrolling.
 *
 * Designed to match ACC #7C tactical dark aesthetic.
 */

import { useState, useMemo, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────

interface Commander {
  id: string
  uid: string
  displayName: string
  avatar?: string
  role: 'r1' | 'r2' | 'r3' | 'r4' | 'r5'
}

type DuelResult = 'victory' | 'defeat'

interface DualResult {
  minimumPlayers: string[]     // uids — Commander Performance Track only, no points
  nonMinimumPlayers: string[]  // uids — Commander Performance Track only, no points
  absentPlayers: string[]      // uids — Commander Performance Track only, no points
  result: DuelResult           // Alliance Victory Track — the only source of points
}

interface DualCascadeSelectionProps {
  members: Commander[]
  minimumScore: number
  onComplete: (result: DualResult) => void
}

// ── Constants ─────────────────────────────────────────────────

const ROLE_LABELS: Record<Commander['role'], string> = {
  r1: 'R1', r2: 'R2', r3: 'R3', r4: 'R4', r5: 'R5',
}

const ROLE_ORDER: Record<Commander['role'], number> = {
  r5: 0, r4: 1, r3: 2, r2: 3, r1: 4,
}

// ── Sub-components ────────────────────────────────────────────

/** Single member chip — sized for a dense 2/4-column grid */
function MemberChip({
  commander,
  selected,
  variant,
  onToggle,
}: {
  commander: Commander
  selected: boolean
  variant: 'green' | 'amber' | 'neutral'
  onToggle: (uid: string) => void
}) {
  const initials = commander.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const selectedStyles = {
    green:   'border-green-500 bg-green-500/15 text-green-300 shadow-[0_0_0_1px_rgba(34,197,94,0.4)]',
    amber:   'border-amber-400 bg-amber-400/15 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]',
    neutral: 'border-tactical-400 bg-tactical-400/10 text-tactical-200',
  }

  const idleStyle = 'border-white/10 bg-white/5 text-tactical-400 hover:border-white/20 hover:bg-white/8 hover:text-tactical-200'

  return (
    <button
      type="button"
      onClick={() => onToggle(commander.uid)}
      className={`
        group relative flex items-center gap-2 rounded-lg border px-2 py-1.5
        transition-all duration-150 select-none cursor-pointer text-left min-w-0
        ${selected ? selectedStyles[variant] : idleStyle}
      `}
    >
      {/* Avatar */}
      <div className={`
        w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold
        transition-colors duration-150
        ${selected
          ? variant === 'green'  ? 'bg-green-500/30 text-green-300'
          : variant === 'amber'  ? 'bg-amber-400/30 text-amber-300'
          :                        'bg-white/10 text-tactical-200'
          : 'bg-white/8 text-tactical-500'
        }
      `}>
        {commander.avatar
          ? <img src={commander.avatar} alt="" className="w-full h-full rounded-lg object-cover" />
          : initials
        }
      </div>

      {/* Name + role */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-tight truncate">
          {commander.displayName}
        </p>
        <p className={`text-[10px] leading-tight mt-0.5 ${selected ? 'opacity-70' : 'text-tactical-600'}`}>
          {ROLE_LABELS[commander.role]}
        </p>
      </div>

      {/* Check mark */}
      {selected && (
        <span className={`
          shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
          ${variant === 'green' ? 'bg-green-500 text-white'
          : variant === 'amber' ? 'bg-amber-400 text-black'
          :                       'bg-white/20 text-white'}
        `}>
          ✓
        </span>
      )}
    </button>
  )
}

/** Step progress bar */
function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: 'Minimum Score' },
    { n: 2, label: 'Non-Minimum' },
    { n: 3, label: 'Summary' },
    { n: 4, label: 'Result' },
  ]
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center flex-1">
          {i > 0 && (
            <div className={`h-px flex-1 transition-colors duration-300 ${step > i ? 'bg-green-500' : 'bg-white/10'}`} />
          )}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`
              w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              transition-all duration-300
              ${step > s.n  ? 'bg-green-500 text-white'
              : step === s.n ? 'bg-green-500/20 border-2 border-green-500 text-green-400'
              :                'bg-white/5 border border-white/10 text-tactical-600'}
            `}>
              {step > s.n ? '✓' : s.n}
            </div>
            <span className={`text-xs whitespace-nowrap hidden sm:block ${step === s.n ? 'text-green-400' : 'text-tactical-600'}`}>
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Summary category card */
function SummaryCard({
  title,
  count,
  members,
  color,
  icon,
}: {
  title: string
  count: number
  members: Commander[]
  color: 'green' | 'amber' | 'red'
  icon: string
}) {
  const styles = {
    green: { border: 'border-green-500/30', bg: 'bg-green-500/8',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300' },
    amber: { border: 'border-amber-400/30', bg: 'bg-amber-400/8',  text: 'text-amber-400',  badge: 'bg-amber-400/20 text-amber-300' },
    red:   { border: 'border-red-500/30',   bg: 'bg-red-500/8',    text: 'text-red-400',    badge: 'bg-red-500/20   text-red-300'   },
  }[color]

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <p className={`font-semibold text-sm ${styles.text}`}>{title}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles.badge}`}>
          {count}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
        {members.length === 0 ? (
          <p className="text-xs text-tactical-600 italic col-span-full">None</p>
        ) : members.map((m) => (
          <div key={m.uid} className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.text} bg-current`} />
            <span className="text-xs text-tactical-300 truncate">{m.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Victory / Defeat chip — large single-select chip, same interaction language as MemberChip */
function ResultChip({
  label,
  icon,
  selected,
  variant,
  onSelect,
}: {
  label: string
  icon: string
  selected: boolean
  variant: 'green' | 'red'
  onSelect: () => void
}) {
  const selectedStyles = {
    green: 'border-green-500 bg-green-500/15 text-green-300 shadow-[0_0_0_1px_rgba(34,197,94,0.4)]',
    red:   'border-red-500 bg-red-500/15 text-red-300 shadow-[0_0_0_1px_rgba(239,68,68,0.4)]',
  }
  const idleStyle = 'border-white/10 bg-white/5 text-tactical-400 hover:border-white/20 hover:bg-white/8 hover:text-tactical-200'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-8
        transition-all duration-150 select-none cursor-pointer
        ${selected ? selectedStyles[variant] : idleStyle}
      `}
    >
      <span className="text-3xl">{icon}</span>
      <span className="text-base font-bold">{label}</span>
      {selected && (
        <span className={`
          mt-1 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold
          ${variant === 'green' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}
        `}>
          ✓
        </span>
      )}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────

export default function DualCascadeSelection({
  members,
  minimumScore,
  onComplete,
}: DualCascadeSelectionProps) {
  // Sort members by role rank (R5 first)
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]),
    [members]
  )

  // ── State ──────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [minimumUids, setMinimumUids] = useState<Set<string>>(new Set())
  const [nonMinimumUids, setNonMinimumUids] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [result, setResult] = useState<DuelResult | null>(null)

  // ── Derived lists ──────────────────────────────────────────

  /** Step 2 pool: everyone NOT in minimumPlayers */
  const step2Pool = useMemo(
    () => sortedMembers.filter((m) => !minimumUids.has(m.uid)),
    [sortedMembers, minimumUids]
  )

  /** Absent = all members minus minimum minus nonMinimum */
  const absentMembers = useMemo(
    () => sortedMembers.filter(
      (m) => !minimumUids.has(m.uid) && !nonMinimumUids.has(m.uid)
    ),
    [sortedMembers, minimumUids, nonMinimumUids]
  )

  /** Filtered pool for current step based on search */
  const currentPool = useMemo(() => {
    const pool = step === 1 ? sortedMembers : step2Pool
    const q = search.trim().toLowerCase()
    if (!q) return pool
    return pool.filter((m) => m.displayName.toLowerCase().includes(q))
  }, [step, sortedMembers, step2Pool, search])

  const currentSelection = step === 1 ? minimumUids : nonMinimumUids
  const setCurrentSelection = step === 1 ? setMinimumUids : setNonMinimumUids

  // ── Handlers ───────────────────────────────────────────────

  const toggle = useCallback((uid: string) => {
    setCurrentSelection((prev) => {
      const next = new Set(prev)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })
  }, [setCurrentSelection])

  const selectAllVisible = useCallback(() => {
    setCurrentSelection((prev) => {
      const next = new Set(prev)
      currentPool.forEach((m) => next.add(m.uid))
      return next
    })
  }, [currentPool, setCurrentSelection])

  const clearSelection = useCallback(() => {
    setCurrentSelection(new Set())
  }, [setCurrentSelection])

  const handleNext = useCallback(() => {
    setSearch('')
    setStep(2)
  }, [])

  const handleFinish = useCallback(() => {
    setSearch('')
    setStep(3)
  }, [])

  /** Step 3 → Step 4: move from performance summary to the result step */
  const handleGoToResult = useCallback(() => {
    setStep(4)
  }, [])

  const handleComplete = useCallback(() => {
    if (!result) return
    onComplete({
      minimumPlayers:    Array.from(minimumUids),
      nonMinimumPlayers: Array.from(nonMinimumUids),
      absentPlayers:     absentMembers.map((m) => m.uid),
      result,
    })
  }, [minimumUids, nonMinimumUids, absentMembers, result, onComplete])

  const handleBack = useCallback(() => {
    setSearch('')
    setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)
  }, [])

  // ── Helper lookups ─────────────────────────────────────────
  const byUid = useMemo(
    () => Object.fromEntries(members.map((m) => [m.uid, m])),
    [members]
  )

  const minimumMembers    = Array.from(minimumUids).map((uid) => byUid[uid]).filter(Boolean)
  const nonMinimumMembers = Array.from(nonMinimumUids).map((uid) => byUid[uid]).filter(Boolean)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col gap-5 animate-fade-in"
      style={{ fontFamily: "'Rajdhani', 'Inter', sans-serif" }}
    >

      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* ── STEP 1 & 2 ── */}
      {(step === 1 || step === 2) && (
        <>
          {/* Header */}
          <div>
            <h2 className="page-title">
              {step === 1
                ? `Minimum Score ≥ ${minimumScore.toLocaleString()}`
                : 'Participated — Below Minimum'}
            </h2>
            <p className="page-subtitle">
              {step === 1
                ? 'Select all commanders who reached the minimum score'
                : 'Select commanders who played but did not reach minimum score'}
            </p>
          </div>

          {/* Counter bar */}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
            <span className="text-xs text-tactical-500 font-medium">
              Selected
            </span>
            <span className={`text-sm font-bold tabular-nums ${
              step === 1 ? 'text-green-400' : 'text-amber-400'
            }`}>
              {step === 1
                ? minimumUids.size
                : nonMinimumUids.size
              }
              <span className="text-tactical-600 font-normal">
                {' '}/ {step === 1 ? sortedMembers.length : step2Pool.length}
              </span>
            </span>
          </div>

          {/* Search + batch controls */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-tactical-500 text-sm">
                ⌕
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commanders…"
                className="w-full rounded-xl border border-white/10 bg-white/5 pl-8 pr-3 py-2.5 text-sm text-tactical-200 placeholder:text-tactical-600 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <button
              type="button"
              onClick={selectAllVisible}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-tactical-400 hover:border-white/20 hover:text-tactical-200 transition-colors"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-tactical-400 hover:border-white/20 hover:text-tactical-200 transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Member grid — dense 2/4-column layout for 100-member alliances */}
          <div className="glass-card p-3">
            {currentPool.length === 0 ? (
              <p className="text-center py-8 text-sm text-tactical-500">
                {search ? 'No members match your search' : 'No members available'}
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                {currentPool.map((commander) => (
                  <MemberChip
                    key={commander.uid}
                    commander={commander}
                    selected={currentSelection.has(commander.uid)}
                    variant={step === 1 ? 'green' : 'amber'}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            {step === 2 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-tactical-400 hover:border-white/20 hover:text-tactical-200 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={step === 1 ? handleNext : handleFinish}
              className={`
                flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-150
                ${step === 1
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-black'}
              `}
            >
              {step === 1
                ? `Next: Non-Minimum (${step2Pool.length - nonMinimumUids.size} remaining) →`
                : `Finish — ${absentMembers.length} absent →`
              }
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: SUMMARY (Commander Performance Track — no points) ── */}
      {step === 3 && (
        <>
          <div>
            <h2 className="page-title">Dual Summary</h2>
            <p className="page-subtitle">
              {members.length} commanders · {minimumMembers.length} minimum ·{' '}
              {nonMinimumMembers.length} non-minimum · {absentMembers.length} absent
            </p>
          </div>

          {/* Totals row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Minimum',     count: minimumMembers.length,    color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
              { label: 'Non-Minimum', count: nonMinimumMembers.length, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
              { label: 'Absent',      count: absentMembers.length,     color: 'text-red-400',   bg: 'bg-red-500/10   border-red-500/20'   },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border ${s.bg} p-3 text-center`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                <p className="text-xs text-tactical-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Category cards */}
          <div className="flex flex-col gap-3">
            <SummaryCard
              title="Minimum Score Achieved"
              count={minimumMembers.length}
              members={minimumMembers}
              color="green"
              icon="🏆"
            />
            <SummaryCard
              title="Participated — Below Minimum"
              count={nonMinimumMembers.length}
              members={nonMinimumMembers}
              color="amber"
              icon="⚔️"
            />
            <SummaryCard
              title="Absent"
              count={absentMembers.length}
              members={absentMembers}
              color="red"
              icon="🚫"
            />
          </div>

          <p className="text-xs text-tactical-600 text-center -mt-1">
            This classification is for participation monitoring only — it does not affect duel points.
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-tactical-400 hover:border-white/20 hover:text-tactical-200 transition-colors"
            >
              ← Edit
            </button>
            <button
              type="button"
              onClick={handleGoToResult}
              className="flex-1 rounded-xl bg-green-600 hover:bg-green-500 py-3 text-sm font-bold text-white transition-colors"
            >
              Next: Alliance Result →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 4: ALLIANCE RESULT (Victory Track — the only source of points) ── */}
      {step === 4 && (
        <>
          <div>
            <h2 className="page-title">Today's Result</h2>
            <p className="page-subtitle">
              Select Victory or Defeat for the alliance. This is independent of minimum-score
              performance and is the only thing that awards duel points.
            </p>
          </div>

          <div className="flex gap-3">
            <ResultChip
              label="Victory"
              icon="🏆"
              selected={result === 'victory'}
              variant="green"
              onSelect={() => setResult('victory')}
            />
            <ResultChip
              label="Defeat"
              icon="💔"
              selected={result === 'defeat'}
              variant="red"
              onSelect={() => setResult('defeat')}
            />
          </div>

          {!result && (
            <p className="text-xs text-amber-500 text-center">
              ⚠ Select Victory or Defeat to finish locking this day
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold text-tactical-400 hover:border-white/20 hover:text-tactical-200 transition-colors"
            >
              ← Edit
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={!result}
              className="flex-1 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed py-3 text-sm font-bold text-white transition-colors"
            >
              Confirm & Submit ✓
            </button>
          </div>
        </>
      )}

    </div>
  )
}