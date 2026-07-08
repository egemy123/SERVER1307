// components/layout/Sidebar.tsx
'use client'
import Link            from 'next/link'
import { usePathname } from 'next/navigation'
import { useState }    from 'react'
import { useRouter }   from 'next/navigation'
import UTCClock        from './UTCClock'
import { signOutUser } from '@/lib/firebase/client'
import type { Role }   from '@/lib/types'

interface NavItem {
  label:    string
  href:     string
  icon:     string
  roles:    Role[]
  divider?: boolean
}

const NAV: NavItem[] = [
  // ── All roles ─────────────────────────────────────────────────────────────
  { label: 'Dashboard',         href: '/dashboard',                    icon: '⬡',  roles: ['r1','r2','r3','r4','r5','supreme'] },
  { label: 'Alliance',          href: '/alliance/[id]',                icon: '◈',  roles: ['r1','r2','r3','r4','r5','supreme'], divider: true },
  { label: 'Members',           href: '/alliance/[id]/members',        icon: '◉',  roles: ['r1','r2','r3','r4','r5','supreme'] },
  { label: 'Duel',              href: '/alliance/[id]/duel',           icon: '◎',  roles: ['r1','r2','r3','r4','r5','supreme'] },
  { label: 'DSB',               href: '/alliance/[id]/dsb',            icon: '◆',  roles: ['r1','r2','r3','r4','r5','supreme'] },
  { label: 'Canyon',            href: '/alliance/[id]/canyon',         icon: '◇',  roles: ['r1','r2','r3','r4','r5','supreme'] },
  { label: 'Transfers',         href: '/transfers',                    icon: '⇄',  roles: ['r1','r2','r3','r4','r5','supreme'], divider: true },
  // ── R4 + R5 + Supreme ─────────────────────────────────────────────────────
  // Verification is a unified route (not alliance-scoped) because Supreme
  // has no fixed allianceId — resolve() would otherwise leave the literal
  // "[id]" in the URL for Supreme and 404.
  { label: 'Verification',      href: '/verification',                 icon: '✅', roles: ['r4','r5','supreme'], divider: true },
  { label: 'Alliance Settings', href: '/alliance/[id]/settings',       icon: '⚙',  roles: ['r4','r5','supreme'] },
  { label: 'Analytics',         href: '/alliance/[id]/analytics',      icon: '▤',  roles: ['r4','r5','supreme'] },
  // Audit Log is alliance-scoped for R4/R5 (the page itself filters by
  // target_alliance_id for non-Supreme roles) and shows everything for Supreme.
  { label: 'Audit Log',         href: '/audit',                        icon: '≡',  roles: ['r4','r5','supreme'], divider: true },
  // ── Supreme only ──────────────────────────────────────────────────────────
  { label: 'Admin',             href: '/admin',                        icon: '⬟',  roles: ['supreme'] },
]

interface Props {
  role:          Role
  allianceId:    string | null
  commanderName: string
  allianceTag:   string | null
}

export default function Sidebar({ role, allianceId, commanderName, allianceTag }: Props) {
  const pathname              = usePathname()
  const router                = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const resolve = (href: string) =>
    allianceId ? href.replace('[id]', allianceId) : href

  const isActive = (href: string) => {
    const resolved = resolve(href)
    if (resolved === '/dashboard') return pathname === '/dashboard'
    return pathname === resolved || pathname.startsWith(resolved + '/')
  }

  // Items whose href still needs an alliance id (contains "[id]") are
  // hidden entirely when there's no allianceId (e.g. Supreme), instead of
  // rendering a dead link with literal brackets in the URL.
  const visible = NAV.filter(
    n => n.roles.includes(role) && (allianceId || !n.href.includes('[id]'))
  )

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOutUser()
    router.push('/login')
  }

  return (
    <aside className="glass-sidebar fixed left-0 top-0 h-screen w-64 z-40 flex flex-col p-4 gap-3">

      {/* Brand */}
      <div className="px-2 py-2 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0"
             style={{ boxShadow: '0 0 0 1px rgba(34,197,94,0.3)' }}>
          <span className="text-white font-bold text-base">◈</span>
        </div>
        <div>
          <p className="text-xs font-bold text-tactical-900 leading-tight">ACC #7C</p>
          <p className="text-xs text-tactical-500 leading-tight">Command Center</p>
        </div>
      </div>

      {/* UTC Clock */}
      <UTCClock compact />

      {/* Alliance tag */}
      {allianceTag && (
        <div className="px-3 py-2 rounded-xl bg-accent-light border border-accent/20">
          <p className="text-xs text-accent-mid font-medium">Alliance</p>
          <p className="text-sm font-bold text-accent-deep tracking-wide">[{allianceTag}]</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto pr-1">
        {visible.map((item, idx) => {
          const href   = resolve(item.href)
          const active = isActive(item.href)
          return (
            <div key={item.href}>
              {item.divider && idx > 0 && (
                <div style={{ height: 1, background: '#E2E8F0', margin: '6px 4px' }} />
              )}
              <Link href={href} className={active ? 'nav-item-active' : 'nav-item'}>
                <span className="text-base w-5 text-center leading-none shrink-0">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Commander info + sign out */}
      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#DCFCE7',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#15803D' }}>
              {commanderName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commanderName}
            </p>
            <p style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {role}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: '#F1F5F9', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#64748B', flexShrink: 0,
            }}
          >
            {signingOut ? '...' : '→'}
          </button>
        </div>
      </div>
    </aside>
  )
}