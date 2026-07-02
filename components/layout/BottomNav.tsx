'use client'
// components/layout/BottomNav.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { Role } from '@/lib/types'

interface Props {
  role:       Role
  allianceId: string | null
}

export default function BottomNav({ role, allianceId }: Props) {
  const pathname = usePathname()
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const allianceBase = allianceId ? `/alliance/${allianceId}` : '#'

  // ── Popup menu items (role-gated) ─────────────────────────────────────────
  const menuItems: { label: string; href: string; icon: string }[] = [
    { label: 'Alliance',  href: allianceBase,              icon: '🏰' },
    { label: 'Members',   href: `${allianceBase}/members`, icon: '👥' },
    { label: 'Duel',      href: `${allianceBase}/duel`,    icon: '⚔️' },
    { label: 'DSB',       href: `${allianceBase}/dsb`,     icon: '◆'  },
    { label: 'Canyon',    href: `${allianceBase}/canyon`,  icon: '◇'  },
    { label: 'Transfers', href: '/transfers',              icon: '🔄' },
  ]

  // Verification is a Supreme/R4/R5 tool that lives at a single unified
  // route (/verification) — it no longer needs an allianceId to work,
  // since Supreme has no fixed alliance. Alliance Settings still genuinely
  // needs an alliance, so it stays gated behind allianceId being present.
  if (['r4', 'r5', 'supreme'].includes(role)) {
    menuItems.push(
      { label: 'Verification', href: '/verification', icon: '✅' },
    )
  }

  if (allianceId && ['r4', 'r5', 'supreme'].includes(role)) {
    menuItems.push(
      { label: 'Alliance Settings', href: `${allianceBase}/settings`, icon: '⚙️' },
    )
  }

  if (role === 'supreme') {
    menuItems.push(
      { label: 'Audit Log', href: '/audit', icon: '≡'  },
    )
  }

  return (
    <>
      {/* Backdrop */}
      {(menuOpen || profileOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-all duration-300"
          onClick={() => { setMenuOpen(false); setProfileOpen(false) }}
        />
      )}

      {/* Alliance/Menu popup */}
      {menuOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                        w-[88%] max-w-sm rounded-3xl border border-white/50
                        bg-white/95 backdrop-blur-xl shadow-2xl p-5
                        animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">☰</div>
            <h3 className="text-lg font-semibold text-gray-800">Menu</h3>
          </div>
          <div className="space-y-1">
            {menuItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3
                            transition-all duration-200
                            ${pathname === item.href || pathname.startsWith(item.href + '/')
                              ? 'bg-green-100 text-green-700'
                              : 'hover:bg-gray-100 text-gray-700'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </div>
                <span className="text-gray-400">›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Profile popup */}
      {profileOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50
                        w-[88%] max-w-sm rounded-3xl border border-white/50
                        bg-white/95 backdrop-blur-xl shadow-2xl p-5
                        animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">👤</div>
            <h3 className="text-lg font-semibold text-gray-800">Profile</h3>
          </div>
          <div className="space-y-1">
            <Link
              href="/profile"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-gray-100 transition text-gray-700"
            >
              <span className="text-xl">👤</span>
              <span>Profile</span>
            </Link>
            <Link
              href="/settings"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-gray-100 transition text-gray-700"
            >
              <span className="text-xl">⚙️</span>
              <span>Settings</span>
            </Link>
            <button
              onClick={() => { window.location.href = '/logout' }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3
                         text-red-600 hover:bg-red-50 transition"
            >
              <span className="text-xl">🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom bar ──────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden
                      border-t border-white/30 bg-white/90 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-around py-2">

          {/* Home */}
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-1 px-3 py-1 transition
                        ${pathname === '/dashboard' ? 'text-green-700' : 'text-gray-500'}`}
          >
            <span className="text-2xl">🏠</span>
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* Menu (hamburger) */}
          <button
            onClick={() => { setProfileOpen(false); setMenuOpen(!menuOpen) }}
            className={`flex flex-col items-center gap-1 px-3 py-1 transition
                        ${menuOpen ? 'text-green-700' : 'text-gray-500'}`}
          >
            <span className="text-2xl">☰</span>
            <span className="text-xs font-medium">Menu</span>
          </button>

          {/* Admin — Supreme only, always visible in bottom bar */}
          {role === 'supreme' && (
            <Link
              href="/admin"
              className={`flex flex-col items-center gap-1 px-3 py-1 transition
                          ${pathname.startsWith('/admin') ? 'text-green-700' : 'text-gray-500'}`}
            >
              <span className="text-2xl">👑</span>
              <span className="text-xs font-medium">Admin</span>
            </Link>
          )}

          {/* Profile */}
          <button
            onClick={() => { setMenuOpen(false); setProfileOpen(!profileOpen) }}
            className={`flex flex-col items-center gap-1 px-3 py-1 transition
                        ${profileOpen ? 'text-green-700' : 'text-gray-500'}`}
          >
            <span className="text-2xl">👤</span>
            <span className="text-xs font-medium">Profile</span>
          </button>

        </div>
      </nav>
    </>
  )
}
