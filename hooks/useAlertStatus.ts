// hooks/useAlertStatus.ts
// Polls GET /api/alerts/status for the given alliance. This is read-only —
// it never touches the cooldown timer itself, only reports it. Re-polls
// periodically to correct for client-clock drift and to reflect alerts
// sent by OTHER members (the whole point of an alliance-wide cooldown is
// that it isn't just local state — someone else's send affects your UI too).

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AlertStatus {
  allianceTag: string | null
  allianceName: string | null
  role: string
  recipients: number
  ready: boolean
  secondsRemaining: number
  dailyQuota: { used: number; limit: number } | null
}

const POLL_INTERVAL_MS = 5000

export function useAlertStatus(allianceId: string) {
  const [status, setStatus] = useState<AlertStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts/status?alliance_id=${allianceId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not load alert status')
        return
      }
      setStatus(data)
      setError('')
    } catch {
      setError('Could not reach the server')
    } finally {
      setLoading(false)
    }
  }, [allianceId])

  useEffect(() => {
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchStatus])

  return { status, loading, error, refetch: fetchStatus }
}