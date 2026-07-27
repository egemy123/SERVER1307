// app/(protected)/alliance/[id]/members/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role }         from '@/lib/types'
import MemberRoleGroups      from '@/components/dashboard/MemberRoleGroups'

const ROLE_COLOR: Record<string, string> = {
  supreme: '#7C3AED', r5: '#15803D', r4: '#1D4ED8', r3: '#64748B', r2: '#64748B', r1: '#64748B',
}

const ROLE_ORDER: Record<string, number> = {
  supreme: 0, r5: 1, r4: 2, r3: 3, r2: 4, r1: 5,
}

const STATUS_BADGE: Record<string, string> = {
  active:     'badge-active',
  inactive:   'badge-inactive',
  disabled:   'badge-disabled',
  unassigned: 'badge-pending',
  former:     'badge-former',
}

const ROLE_LABEL: Record<string, string> = {
  supreme: 'Supreme', r5: 'R5', r4: 'R4', r3: 'R3', r2: 'R2', r1: 'R1',
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: allianceId } = await params
  const headersList  = await headers()
  const role         = headersList.get('x-commander-role') as Role
  const commanderUid = headersList.get('x-commander-uid')

  if (!commanderUid) redirect('/login')

  const supabase = createAdminClient()

  const [{ data: alliance }, { data: members }] = await Promise.all([
    supabase.from('alliances').select('tag, name').eq('id', allianceId).single(),
    supabase.from('commanders')
      .select('uid, name, role, status, verification_status, inactive_flagged, inactive_flagged_at, linked_google_uid')
      .eq('alliance_id', allianceId)
      .order('role'),
  ])

  if (!alliance) redirect('/dashboard')

  const sorted = (members ?? []).sort((a: any, b: any) =>
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name)
  )

  const activeCount   = sorted.filter((m: any) => m.status === 'active').length
  const inactiveCount = sorted.filter((m: any) => m.inactive_flagged).length

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">[{alliance.tag}] Members</h1>
          <p className="page-subtitle">
            {activeCount} active · {inactiveCount > 0 ? `${inactiveCount} flagged inactive` : 'no inactive flags'}
          </p>
        </div>
      </div>

      {/* Leader (Supreme/R5) — crown badges the avatar, name/tag stacked right */}
      {sorted.filter((m: any) => m.role === 'supreme' || m.role === 'r5').map((m: any) => (
        <div key={m.uid} className="flex justify-center">
          <div className="glass-card p-5 flex items-center justify-center gap-3 w-full max-w-xs">
            <div className="flex flex-col items-center">
              <svg viewBox="0 0 24 16" className="w-9 h-9 -mb-2 z-10 drop-shadow-[0_2px_2px_rgba(180,83,9,0.35)]">
                <defs>
                  <linearGradient id={`crownGold-${m.uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#FDE68A" />
                    <stop offset="55%"  stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#B45309" />
                  </linearGradient>
                </defs>
                <path
                  d="M2 6.5 L6 9.5 L12 2 L18 9.5 L22 6.5 L20 14 H4 Z"
                  fill={`url(#crownGold-${m.uid})`}
                  stroke="#92400E"
                  strokeWidth="0.6"
                  strokeLinejoin="round"
                />
                <circle cx="2"  cy="6.5" r="1.5" fill="#FBBF24" stroke="#92400E" strokeWidth="0.4" />
                <circle cx="12" cy="2"   r="1.5" fill="#FBBF24" stroke="#92400E" strokeWidth="0.4" />
                <circle cx="22" cy="6.5" r="1.5" fill="#FBBF24" stroke="#92400E" strokeWidth="0.4" />
                <rect x="5" y="12" width="14" height="2" rx="0.5" fill="#92400E" opacity="0.35" />
              </svg>
              <div className="w-14 h-14 rounded-full bg-accent-light flex items-center justify-center shrink-0 ring-4 ring-white">
                <span className="text-lg font-bold text-accent-deep">{m.name.charAt(0).toUpperCase()}</span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1">
              <p className="font-semibold text-tactical-900">{m.name}</p>
              <span
                className="text-xs font-bold uppercase px-2 py-0.5 rounded-md text-white"
                style={{ backgroundColor: ROLE_COLOR[m.role] }}
              >
                {ROLE_LABEL[m.role]}
              </span>
            </div>
          </div>
        </div>
      ))}

      {/* Rank groups — R4/R3/R2/R1 accordion. Only the viewer's own rank
          starts expanded; the rest start closed and open on click. */}
      <MemberRoleGroups
        members={sorted.filter((m: any) => m.role !== 'supreme' && m.role !== 'r5')}
        roleOrder={['r4', 'r3', 'r2', 'r1']}
        roleLabel={ROLE_LABEL}
        roleColor={ROLE_COLOR}
        viewerRole={role}
      />
    </div>
  )
}