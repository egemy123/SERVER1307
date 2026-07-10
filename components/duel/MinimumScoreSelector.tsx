'use client'
// components/duel/MinimumScoreSelector.tsx
//
// Minimum Score input with quick-preset segmented buttons (iOS-style),
// role-gated editing, and live persistence to duel_weeks.draft_minimum_scores
// so every alliance member sees the same value even before the day locks.
//
// Reuses the same R4/R5/Supreme permission tier as the rest of Duel Entry
// — no separate role check invented here.

import { useState, useEffect, useCallback, useRef } from 'react'

export const QUICK_PRESETS = [
  { label: '7.2M', value: 7_200_000 },
  { label: '10M',  value: 10_000_000 },
] as const

type PresetKey = number | 'custom'

interface Props {
  /** Current commander's role — only 'r4' | 'r5' | 'supreme' can edit. */
  role: string
  duelWeekId: string
  day: string
  /** Value to fall back to when nothing has been saved yet for this day. */
  initialValue: number | null
  /** Bubbles the live value up to the parent (used for pass/fail math, etc). */
  onChange: (value: number) => void
}

const EDITOR_ROLES = ['r4', 'r5', 'supreme']

export default function MinimumScoreSelector({
  role,
  duelWeekId,
  day,
  initialValue,
  onChange,
}: Props) {
  const canEdit = EDITOR_ROLES.includes(role)

  const [value, setValue]     = useState<string>(initialValue ? String(initialValue) : '')
  const [preset, setPreset]   = useState<PresetKey>('custom')
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync preset highlight whenever the numeric value matches a known preset.
  useEffect(() => {
    const num = value ? parseInt(value, 10) : null
    const matched = QUICK_PRESETS.find(p => p.value === num)
    setPreset(matched ? matched.value : 'custom')
  }, [value])

  // Re-sync from server-provided initialValue if it changes underneath us
  // (e.g. another R4/R5 changed it and we refetch the week).
  useEffect(() => {
    if (initialValue !== null && String(initialValue) !== value) {
      setValue(String(initialValue))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue])

  const persist = useCallback(async (num: number) => {
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/duel/minimum-score', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duel_week_id: duelWeekId, day, minimum_score: num }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save')
        return
      }
      onChange(num)
    } catch {
      setSaveError('Failed to save — check your connection')
    } finally {
      setSaving(false)
    }
  }, [duelWeekId, day, onChange])

  const debouncedPersist = useCallback((num: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => persist(num), 500)
  }, [persist])

  const applyPreset = (presetValue: number) => {
    if (!canEdit) return
    setValue(String(presetValue))
    setPreset(presetValue)
    persist(presetValue) // presets save immediately, no debounce needed
  }

  const handleManualChange = (raw: string) => {
    if (!canEdit) return
    // Only positive integers — strip anything else as the user types.
    const cleaned = raw.replace(/[^\d]/g, '')
    setValue(cleaned)
    setPreset('custom')
    const num = cleaned ? parseInt(cleaned, 10) : NaN
    if (Number.isInteger(num) && num > 0) {
      debouncedPersist(num)
    }
  }

  const handleBlur = () => {
    if (!canEdit) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const num = value ? parseInt(value, 10) : NaN
    if (Number.isInteger(num) && num > 0) persist(num)
  }

  return (
    <div>
      <label className="text-xs font-medium text-tactical-600 block mb-1.5">
        Minimum Required Score
      </label>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={e => handleManualChange(e.target.value)}
          onBlur={handleBlur}
          disabled={!canEdit}
          placeholder="e.g. 7200000"
          className="input-base font-mono flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {saving && (
          <span className="text-xs text-tactical-400 shrink-0">Saving…</span>
        )}
      </div>

      {/* Segmented preset buttons — iOS-style */}
      <div className="flex mt-2 rounded-xl border border-tactical-200 overflow-hidden w-fit">
        {QUICK_PRESETS.map((p, i) => (
          <button
            key={p.value}
            type="button"
            disabled={!canEdit}
            onClick={() => applyPreset(p.value)}
            className={`px-4 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60
              ${i > 0 ? 'border-l border-tactical-200' : ''}
              ${preset === p.value
                ? 'bg-accent text-white'
                : 'bg-white text-tactical-600 hover:bg-surface-overlay'}`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => { if (canEdit) setPreset('custom') }}
          className={`px-4 py-1.5 text-sm font-semibold border-l border-tactical-200 transition-colors disabled:cursor-not-allowed disabled:opacity-60
            ${preset === 'custom'
              ? 'bg-accent text-white'
              : 'bg-white text-tactical-600 hover:bg-surface-overlay'}`}
        >
          Custom
        </button>
      </div>

      {!canEdit && (
        <p className="text-xs text-tactical-400 mt-1.5">
          Only R4, R5, or Supreme can change the minimum score.
        </p>
      )}
      {canEdit && !value && (
        <p className="text-xs text-amber-600 mt-1.5">⚠ Set a minimum score to continue</p>
      )}
      {saveError && (
        <p className="text-xs text-red-600 mt-1.5">{saveError}</p>
      )}
    </div>
  )
}