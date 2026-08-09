// hooks/useCountdown.ts
// Ticks every second, returning Days/Hours/Minutes/Seconds remaining
// until a target Date. Used on event cards, the dashboard widget, and
// the fullscreen AlarmOverlay.

import { useState, useEffect } from 'react'

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  isPast: boolean
}

function computeParts(target: Date): CountdownParts {
  const totalMs = target.getTime() - Date.now()
  const isPast  = totalMs <= 0
  const abs     = Math.abs(totalMs)

  return {
    days:    Math.floor(abs / 86_400_000),
    hours:   Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
    totalMs,
    isPast,
  }
}

export function useCountdown(target: Date | string | null): CountdownParts | null {
  const targetDate = target ? new Date(target) : null
  const [parts, setParts] = useState<CountdownParts | null>(targetDate ? computeParts(targetDate) : null)

  useEffect(() => {
    if (!targetDate) { setParts(null); return }
    setParts(computeParts(targetDate))
    const interval = setInterval(() => setParts(computeParts(targetDate)), 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate?.getTime()])

  return parts
}

/** Formats countdown parts as "02d 06h 21m 12s", omitting leading zero units. */
export function formatCountdown(parts: CountdownParts): string {
  const segs: string[] = []
  if (parts.days > 0) segs.push(`${String(parts.days).padStart(2, '0')}d`)
  if (parts.days > 0 || parts.hours > 0) segs.push(`${String(parts.hours).padStart(2, '0')}h`)
  if (parts.days > 0 || parts.hours > 0 || parts.minutes > 0) segs.push(`${String(parts.minutes).padStart(2, '0')}m`)
  segs.push(`${String(parts.seconds).padStart(2, '0')}s`)
  return segs.join(' ')
}