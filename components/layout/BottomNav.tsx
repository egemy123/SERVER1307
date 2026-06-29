'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { Role } from '@/lib/types'

interface Props {
  role: Role
  allianceId: string | null
}

export default function BottomNav({ role, allianceId }: Props) {
  const pathname = usePathname()

  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const allianceBase = allianceId ? `/alliance/${allianceId}` : '#'

  const menuItems: { label: string; href: string; icon: string }[] = [
    { label: 'Alliance', href: allianceBase, icon: '🏰' },
    { label: 'Dual', href: `${allianceBase}/duel`, icon: '⚔️' },
    { label: 'Members', href: `${allianceBase}/members`, icon: '👥' },
    { label: 'Transfers', href: '/transfers', icon: '🔄' },
  ]

  if (['r4', 'r5', 'supreme'].includes(role)) {
    menuItems.push(
      {
        label: 'Verification',
        href: `${allianceBase}/verification`,
        icon: '✅',
      },
      {
        label: 'Alliance Settings',
        href: `${allianceBase}/settings`,
        icon: '⚙️',
      }
    )
  }

  return (
    <>
      {/* Background Blur */}
      {(menuOpen || profileOpen) && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-md transition-all duration-300"
          onClick={() => {
            setMenuOpen(false)
            setProfileOpen(false)
          }}
        />
      )}

      {/* Alliance Menu Popup */}
      {menuOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[88%] max-w-sm rounded-3xl border border-white/50 bg-white/95 backdrop-blur-xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">☰</div>
            <h3 className="text-lg font-semibold text-gray-800">
              Alliance Menu
            </h3>
          </div>

          <div className="space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 transition-all duration-200 ${
                  pathname === item.href
                    ? 'bg-green-100 text-green-700'
                    : 'hover:bg-gray-100'
                }`}
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

      {/* Profile Popup */}
      {profileOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[88%] max-w-sm rounded-3xl border border-white/50 bg-white/95 backdrop-blur-xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center mb-4">
            <div className="text-3xl mb-2">👤</div>
            <h3 className="text-lg font-semibold text-gray-800">
              Profile
            </h3>
          </div>

          <div className="space-y-2">
            <Link
              href="/profile"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-gray-100 transition"
            >
              <span className="text-xl">👤</span>
              <span>Profile</span>
            </Link>

            <Link
              href="/settings"
              onClick={() => setProfileOpen(false)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 hover:bg-gray-100 transition"
            >
              <span className="text-xl">⚙️</span>
              <span>Settings</span>
            </Link>

            <button
              onClick={() => {
                window.location.href = '/logout'
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-red-600 hover:bg-red-50 transition"
            >
              <span className="text-xl">🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/30 bg-white/90 backdrop-blur-xl shadow-lg">
        <div className="flex items-center justify-around py-3">
          {/* Home */}
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-1 transition ${
              pathname === '/dashboard' ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            <span className="text-2xl">🏠</span>
            <span className="text-xs font-medium">Home</span>
          </Link>

          {/* Menu */}
          <button
            onClick={() => {
              setProfileOpen(false)
              setMenuOpen(!menuOpen)
            }}
            className={`flex flex-col items-center gap-1 transition ${
              menuOpen ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            <span className="text-2xl">☰</span>
            <span className="text-xs font-medium">Menu</span>
          </button>

          {/* Admin — Supreme only */}
          {role === 'supreme' && (
            <Link
              href="/admin"
              className={`flex flex-col items-center gap-1 transition ${
                pathname.startsWith('/admin') ? 'text-green-700' : 'text-gray-500'
              }`}
            >
              <span className="text-2xl">👑</span>
              <span className="text-xs font-medium">Admin</span>
            </Link>
          )}

          {/* Profile */}
          <button
            onClick={() => {
              setMenuOpen(false)
              setProfileOpen(!profileOpen)
            }}
            className={`flex flex-col items-center gap-1 transition ${
              profileOpen ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            <span className="text-2xl">👤</span>
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </nav>
    </>
  )
}