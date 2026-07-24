'use client'
// components/dashboard/AlertHistoryRow.tsx
// Icon-only button, sits inline next to "Send Alert" in the same row.
// Click opens a modal with the full history — no text label taking up
// space in the card itself, just the icon.

import { useEffect, useState } from 'react'
import { History, X } from 'lucide-react'
import { relativeTime } from '@/lib/utils/utc2'

interface HistoryEntry {
  id:         string
  sentBy:     string
  sentByRole: string
  sentAt:     string
  alertType:  string
  title:      string | null
  recipients: number | null
}

interface Props {
  allianceId: string
}

export default function AlertHistoryRow({ allianceId }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/alerts/history?alliance_id=${allianceId}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? 'Could not load alert history')
          return
        }
        setEntries(data.history)
      } catch {
        if (!cancelled) setError('Could not reach the server')
      }
    }

    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [allianceId])

  return (
    <>
      {/* Icon-only trigger — sits inline next to Send Alert */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Alert History"
        className="w-11 h-11 rounded-xl border border-tactical-200 flex items-center justify-center
                   text-tactical-600 hover:bg-surface-overlay active:scale-[0.97] transition-all shrink-0"
      >
        <History className="w-5 h-5" />
      </button>

      {/* Modal */}
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
              <p className="text-sm font-semibold text-tactical-900">Alert History</p>
              <button type="button" onClick={() => setOpen(false)} className="text-tactical-400 hover:text-tactical-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-2">
              {error ? (
                <p className="text-xs text-red-500 p-3">{error}</p>
              ) : entries === null ? (
                <p className="text-xs text-tactical-400 p-3">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="text-xs text-tactical-400 p-3">No alerts sent yet.</p>
              ) : (
                <div className="divide-y divide-tactical-100">
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm text-tactical-900 truncate">
                          <span className="font-semibold">{e.sentBy}</span>
                          <span className="text-tactical-400"> · {e.sentByRole.toUpperCase()}</span>
                        </p>
                        <p className="text-xs text-tactical-500 truncate">
                          {e.title ?? e.alertType} · {relativeTime(e.sentAt)}
                        </p>
                      </div>
                      {e.recipients !== null && (
                        <span className="text-xs text-tactical-400 shrink-0">→ {e.recipients}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}