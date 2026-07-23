'use client'
// components/dashboard/AlertHistoryPanel.tsx
// Compact "who sent what alert, when" monitor — sits right under the Send
// Alert widget so R4/R5 can spot misuse at a glance without digging through
// the full audit log page.

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
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

export default function AlertHistoryPanel({ allianceId }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError]     = useState('')

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
    // Refresh alongside the alert widget's own polling cadence.
    const interval = setInterval(load, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [allianceId])

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-tactical-400" />
        <p className="text-sm font-semibold text-tactical-900">Alert History</p>
      </div>

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : entries === null ? (
        <p className="text-xs text-tactical-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-tactical-400">No alerts sent yet.</p>
      ) : (
        <div className="divide-y divide-tactical-100 max-h-72 overflow-y-auto -mx-1">
          {entries.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-1 py-2">
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
  )
}