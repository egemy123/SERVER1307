'use client'
// components/dashboard/MemberRoleGroups.tsx
// Rank dropdown filter — pick a rank (or "All Ranks") from a select, and
// only that rank's members render below. Replaces the old click-to-expand
// chevron sections with a single dropdown-driven view.

import { useState, useMemo } from 'react'
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
  roleOrder: string[]      // e.g. ['r4','r3','r2','r1'] — dropdown order
  roleLabel: Record<string, string>
  roleColor: Record<string, string>
}

const STATUS_BADGE: Record<string, string> = {
  active:     'badge-active',
  inactive:   'badge-inactive',
  disabled:   'badge-disabled',
  unassigned: 'badge-pending',
  former:     'badge-former',
}

const ALL_RANKS = '__all__'

export default function MemberRoleGroups({ members, roleOrder, roleLabel, roleColor }: Props) {
  const [selectedRole, setSelectedRole] = useState<string>(ALL_RANKS)
  const [query, setQuery]               = useState('')

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const role of roleOrder) map[role] = members.filter(m => m.role === role).length
    return map
  }, [members, roleOrder])

  const q = query.trim().toLowerCase()

  const visibleMembers = useMemo(() => {
    let list = selectedRole === ALL_RANKS ? members : members.filter(m => m.role === selectedRole)
    if (q.length > 0) list = list.filter(m => m.name.toLowerCase().includes(q))
    return list
  }, [members, selectedRole, q])

  return (
    <div className="flex flex-col gap-3">
      {/* Rank dropdown */}
      <div className="relative">
        <select
          value={selectedRole}
          onChange={e => setSelectedRole(e.target.value)}
          className="input-base appearance-none pr-10 cursor-pointer"
        >
          <option value={ALL_RANKS}>All Ranks ({members.length})</option>
          {roleOrder.map(role => (
            <option key={role} value={role}>
              {roleLabel[role] ?? role} ({counts[role] ?? 0})
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-tactical-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {/* Search within the selected rank */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search for members..."
        className="input-base"
      />

      {/* Member list */}
      <div className="glass-card overflow-hidden divide-y divide-tactical-100">
        {visibleMembers.length === 0 ? (
          <p className="text-xs text-tactical-400 p-6 text-center">
            {q.length > 0 ? 'No matches' : 'No members at this rank'}
          </p>
        ) : (
          visibleMembers.map(m => (
            <div key={m.uid} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-accent-deep">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-tactical-900 text-sm truncate">{m.name}</p>
                  {selectedRole === ALL_RANKS && (
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded text-white inline-block mt-0.5"
                      style={{ backgroundColor: roleColor[m.role] ?? '#64748B' }}
                    >
                      {roleLabel[m.role] ?? m.role}
                    </span>
                  )}
                </div>
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
    </div>
  )
}