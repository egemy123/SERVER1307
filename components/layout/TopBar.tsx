// components/layout/TopBar.tsx
'use client'
import { useState }    from 'react'
import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import UTCClock        from './UTCClock'
import type { Role }   from '@/lib/types'

interface Props {
  role:          Role
  commanderName: string
  allianceTag:   string | null
}

export default function TopBar({ role, commanderName, allianceTag }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 glass-sidebar border-b border-white/40 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">◈</span>
          </div>
          <div>
            <p className="text-xs font-bold text-tactical-900 leading-tight">ACC #7C</p>
            {allianceTag && (
              <p className="text-xs text-accent-mid font-medium leading-tight">[{allianceTag}]</p>
            )}
          </div>
        </div>

        {/* UTC Clock compact */}
        <UTCClock compact />

        {/* Commander initial */}
        <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center">
          <span className="text-sm font-bold text-accent-deep">
            {commanderName.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  )
}