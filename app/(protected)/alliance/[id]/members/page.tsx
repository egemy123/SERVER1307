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
  const isR4Plus      = ['r4', 'r5', 'supreme'].includes(role)

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

      {/* Inactive alert */}
      {isR4Plus && inactiveCount > 0 && (
        <div className="glass-card p-4 border border-amber-300 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500 animate-pulse-soft text-lg">⚠</span>
            <p className="font-semibold text-amber-800 text-sm">
              {inactiveCount} member{inactiveCount !== 1 ? 's' : ''} flagged inactive
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sorted
              .filter((m: any) => m.inactive_flagged)
              .map((m: any) => (
                <span key={m.uid} className="badge badge-warning">{m.name}</span>
              ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card text-center">
          <p className="text-2xl font-semibold text-tactical-900">{sorted.length}</p>
          <p className="text-xs text-tactical-500 mt-1">Total</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-2xl font-semibold text-accent-deep">{activeCount}</p>
          <p className="text-xs text-tactical-500 mt-1">Active</p>
        </div>
        <div className="stat-card text-center">
          <p className={`text-2xl font-semibold ${inactiveCount > 0 ? 'text-amber-700' : 'text-tactical-900'}`}>
            {inactiveCount}
          </p>
          <p className="text-xs text-tactical-500 mt-1">Inactive</p>
        </div>
      </div>

      {/* Leader (Supreme/R5) — centered, standalone card at the top */}
      {sorted.filter((m: any) => m.role === 'supreme' || m.role === 'r5').map((m: any) => (
        <div key={m.uid} className="flex justify-center">
          <div className="glass-card p-5 flex flex-col items-center gap-2 w-full max-w-xs text-center">
            <div className="w-14 h-14 rounded-full bg-accent-light flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-accent-deep">{m.name.charAt(0).toUpperCase()}</span>
            </div>
            <p className="font-semibold text-tactical-900">{m.name}</p>
            <span
              className="text-xs font-bold uppercase px-2 py-0.5 rounded-md text-white"
              style={{ backgroundColor: ROLE_COLOR[m.role] }}
            >
              {ROLE_LABEL[m.role]}
            </span>
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
