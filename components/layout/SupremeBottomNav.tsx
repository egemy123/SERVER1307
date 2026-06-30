// components/layout/SupremeBottomNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { label: 'Home',     href: '/supreme-dashboard',   icon: '⌂' },
  { label: 'Admin',    href: '/supreme-admin',       icon: '👑' },
  { label: 'Audit',    href: '/supreme-audit',       icon: '≡' },
  { label: 'Alliances',href: '/supreme-alliances',   icon: '◈' },
]

export default function SupremeBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-surface-base/95 backdrop-blur-md
                 border-t border-tactical-100 px-2 py-2 flex items-center justify-around
                 lg:hidden"
    >
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors duration-150 ${
              active ? 'text-accent-deep' : 'text-tactical-400'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
