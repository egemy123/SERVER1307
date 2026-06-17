// components/layout/UTCClock.tsx
'use client'

import { useEffect, useState } from 'react'
import { getClockDisplay } from '@/lib/utils/utc2'

export default function UTCClock({ compact = false }: { compact?: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [display, setDisplay] = useState(getClockDisplay())

  useEffect(() => {
    setMounted(true)

    const tick = setInterval(() => {
      setDisplay(getClockDisplay())
    }, 1000)

    return () => clearInterval(tick)
  }, [])

  // Prevent hydration mismatch
  if (!mounted) {
    return compact ? (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-light border border-accent/20">
        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
        <span className="font-mono text-xs font-semibold text-accent-deep">
          --:--:--
        </span>
        <span className="text-xs text-accent-mid font-medium ml-auto">
          UTC-2
        </span>
      </div>
    ) : (
      <div className="glass-card px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="font-mono text-3xl font-semibold text-tactical-900 tracking-tight leading-none">
              --:--:--
            </span>
          </div>
          <div className="ml-auto">
            <span className="badge badge-active font-mono text-xs">
              UTC-2
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-light border border-accent/20">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft shrink-0" />

        <span className="font-mono text-xs font-semibold text-accent-deep">
          {display.time}
          <span className="text-accent/60">
            :{display.seconds}
          </span>
        </span>

        <span className="text-xs text-accent-mid font-medium ml-auto">
          UTC-2
        </span>
      </div>
    )
  }

  return (
    <div className="glass-card px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-end gap-1">
            <span className="font-mono text-3xl font-semibold text-tactical-900 tracking-tight leading-none">
              {display.time}
            </span>

            <span className="font-mono text-xl text-tactical-400 leading-none mb-0.5">
              :{display.seconds}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-soft" />

            <span className="text-xs text-tactical-500">
              {display.day}
            </span>

            <span className="text-xs text-tactical-300">·</span>

            <span className="text-xs text-tactical-500">
              {display.date}
            </span>
          </div>
        </div>

        <div className="ml-auto">
          <span className="badge badge-active font-mono text-xs">
            UTC-2
          </span>
        </div>
      </div>
    </div>
  )
}