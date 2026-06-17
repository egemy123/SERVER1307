// app/(protected)/alliance/[id]/members/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Role }         from '@/lib/types'

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

      {/* Member table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-glass">
            <thead>
              <tr>
                <th>Commander</th>
                <th>Role</th>
                <th>Status</th>
                <th>Verified</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m: any) => (
                <tr key={m.uid}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-accent-deep">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-tactical-900 text-sm">{m.name}</p>
                        <p className="text-xs font-mono text-tactical-400">{m.uid}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-active text-xs uppercase">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge text-xs ${STATUS_BADGE[m.status] ?? 'badge-inactive'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge text-xs ${m.verification_status === 'linked' ? 'badge-active' : 'badge-pending'}`}>
                      {m.verification_status === 'linked' ? '✓ linked' : m.verification_status}
                    </span>
                  </td>
                  <td>
                    {m.inactive_flagged ? (
                      <span className="badge badge-warning animate-pulse-soft text-xs">⚠ inactive</span>
                    ) : (
                      <span className="text-xs text-tactical-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-tactical-400 text-sm">
                    No members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}