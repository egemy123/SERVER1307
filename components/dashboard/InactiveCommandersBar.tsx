'use client'
// components/dashboard/InactiveCommandersBar.tsx
// Compact single-line bar — click to open the flagged-inactive list in a
// popup, same interaction pattern as AlertHistoryPanel. Data is passed in
// as a prop (already fetched server-side in dashboard/page.tsx) — no new
// API call needed.

import { useState } from 'react'
import { X } from 'lucide-react'
import { relativeTime } from '@/lib/utils/utc2'

interface InactiveMember {
  uid: string
  name: string
  inactive_flagged_at: string | null
}

interface Props {
  members: InactiveMember[]
}

export default function InactiveCommandersBar({ members }: Props) {
  const [open, setOpen] = useState(false)

  if (members.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full glass-card p-3 border border-amber-300 bg-amber-50/30 flex items-center justify-between hover:bg-amber-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-500 animate-pulse-soft">⚠</span>
          <p className="font-semibold text-amber-800 text-sm truncate">
            {members.length} Inactive Commander{members.length !== 1 ? 's' : ''} Flagged
          </p>
        </div>
        <span className="text-amber-600 text-sm shrink-0">View →</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-glass-lg w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-tactical-100">
              <p className="text-sm font-semibold text-tactical-900">
                Inactive Commanders ({members.length})
              </p>
              <button type="button" onClick={() => setOpen(false)} className="text-tactical-400 hover:text-tactical-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-2">
              <div className="divide-y divide-tactical-100">
                {members.map(m => (
                  <div key={m.uid} className="flex items-center justify-between gap-3 p-3">
                    <p className="text-sm font-medium text-tactical-900 truncate">{m.name}</p>
                    <span className="text-xs text-amber-600 shrink-0">
                      {m.inactive_flagged_at ? relativeTime(m.inactive_flagged_at) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}