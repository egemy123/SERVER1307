'use client'
// components/dashboard/CanyonWeekToggle.tsx
//
// Shows whether Canyon is on/off for the current week. Everyone sees a
// read-only badge; Supreme gets a working toggle. Changes are scoped to
// THIS week's key, so next week starts fresh (defaults back to active)
// instead of carrying this week's setting forward.

import { useState } from 'react'

interface Props {
  weekKey:       string
  initialActive: boolean
  isSupreme:     boolean
}

export default function CanyonWeekToggle({ weekKey, initialActive, isSupreme }: Props) {
  const [active,  setActive]  = useState(initialActive)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const toggle = async () => {
    const next = !active
    setSaving(true)
    setError('')
    try {
      const res  = await fetch('/api/canyon-status', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ week_key: weekKey, active: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update'); return }
      setActive(next)
    } catch {
      setError('Failed to update')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupreme) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
          active
            ? 'bg-accent-light text-accent-deep'
            : 'bg-tactical-100 text-tactical-500'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent' : 'bg-tactical-400'}`} />
        Canyon {active ? 'ON' : 'OFF'} this week
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50 ${
          active
            ? 'bg-accent-light text-accent-deep hover:bg-accent/20'
            : 'bg-tactical-100 text-tactical-500 hover:bg-tactical-200'
        }`}
        title="Supreme only — toggles Canyon for this week"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-accent' : 'bg-tactical-400'}`} />
        Canyon {active ? 'ON' : 'OFF'} this week
        <span className="text-tactical-400 ml-0.5">{saving ? '...' : '✎'}</span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
