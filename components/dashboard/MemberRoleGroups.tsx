'use client'
// components/dashboard/MemberRoleGroups.tsx
// Accordion-style rank groups — R4/R3/R2/R1 each render as their own
// collapsible section. On load, only the viewer's own rank starts expanded;
// every other section starts closed and opens on click. Searching
// auto-expands any section that has a match; clearing the search restores
// the default (only the viewer's own rank open).

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface Member {
  uid: string
  name: string
  role: string
  status: string
  verification_status: string
  inactive_flagged: boolean
}

interface Props {
  members: Member[]
  roleOrder: string[]      // e.g. ['r4','r3','r2','r1'] — section order, top to bottom
  roleLabel: Record<string, string>
  roleColor: Record<string, string>
  viewerRole?: string      // the logged-in commander's own role — decides which section starts open
}

const STATUS_BADGE: Record<string, string> = {
  active:     'badge-active',
  inactive:   'badge-inactive',
  disabled:   'badge-disabled',
  unassigned: 'badge-pending',
  former:     'badge-former',
}

export default function MemberRoleGroups({ members, roleOrder, roleLabel, roleColor, viewerRole }: Props) {
  const [query, setQuery] = useState('')

  const defaultOpen = () =>
    new Set<string>(viewerRole && roleOrder.includes(viewerRole) ? [viewerRole] : [])

  const [openRoles, setOpenRoles] = useState<Set<string>>(defaultOpen)

  const q = query.trim().toLowerCase()

  const grouped = useMemo(() => {
    const map: Record<string, Member[]> = {}
    for (const role of roleOrder) {
      map[role] = members.filter(
        m => m.role === role && (q.length === 0 || m.name.toLowerCase().includes(q))
      )
    }
    return map
  }, [members, roleOrder, q])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const role of roleOrder) map[role] = members.filter(m => m.role === role).length
    return map
  }, [members, roleOrder])

  // While searching, auto-expand every section with a match so results are
  // visible without extra clicks. Clearing the search restores the default
  // (only the viewer's own rank open).
  useEffect(() => {
    if (q.length === 0) {
      setOpenRoles(defaultOpen())
      return
    }
    const matches = roleOrder.filter(role => (grouped[role]?.length ?? 0) > 0)
    setOpenRoles(new Set(matches))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const toggleRole = (role: string) => {
    setOpenRoles(prev => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search for members..."
        className="input-base"
      />

      {roleOrder.map(role => {
        const isOpen = openRoles.has(role)
        const roleMembers = grouped[role] ?? []

        return (
          <div key={role} className="glass-card overflow-hidden">
            <button
              type="button"
              onClick={() => toggleRole(role)}
              className="w-full flex items-center justify-between gap-3 p-4"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="text-xs font-bold uppercase px-2 py-0.5 rounded-md text-white"
                  style={{ backgroundColor: roleColor[role] ?? '#64748B' }}
                >
                  {roleLabel[role] ?? role}
                </span>
                <span className="text-xs text-tactical-500">{counts[role] ?? 0} members</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-tactical-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="divide-y divide-tactical-100 border-t border-tactical-100">
                {roleMembers.length === 0 ? (
                  <p className="text-xs text-tactical-400 p-6 text-center">
                    {q.length > 0 ? 'No matches' : 'No members at this rank'}
                  </p>
                ) : (
                  roleMembers.map(m => (
                    <div key={m.uid} className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-accent-deep">
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="font-medium text-tactical-900 text-sm truncate">{m.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`badge text-xs ${STATUS_BADGE[m.status] ?? 'badge-inactive'}`}>
                          {m.status}
                        </span>
                        {m.inactive_flagged && (
                          <span className="badge badge-warning animate-pulse-soft text-xs">⚠</span>
                        )}
                        <span className={`badge text-xs ${m.verification_status === 'linked' ? 'badge-active' : 'badge-pending'}`}>
                          {m.verification_status === 'linked' ? '✓' : '…'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
