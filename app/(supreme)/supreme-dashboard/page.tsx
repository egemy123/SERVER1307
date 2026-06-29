// app/(supreme)/supreme-dashboard/page.tsx
// NOTE: path renamed from "dashboard" to "supreme-dashboard" — route groups
// like (protected) and (supreme) are invisible in the URL, so a folder
// named "dashboard" inside BOTH groups collides on the same /dashboard path.
// This is what caused the Turbopack build error.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import UTCClock from '@/components/layout/UTCClock'
import { getWeekKey } from '@/lib/utils/utc2'

export default async function SupremeDashboardPage() {
  const headersList = await headers()

  const commanderUid = headersList.get('x-commander-uid')
  const role = headersList.get('x-commander-role')

  if (!commanderUid || role !== 'supreme') {
    redirect('/login')
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const weekKey = getWeekKey()

  const [
    { data: commander },
    { data: alliances },
    { data: allCommanders },
    { data: inactiveMembers },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from('commanders')
      .select('name, role, status')
      .eq('uid', commanderUid)
      .single(),

    // Supreme sees every alliance, not just one
    supabase
      .from('alliances')
      .select(`
        id,
        tag,
        gift_level,
        target_1,
        target_2,
        target_3,
        target_4,
        target_5,
        target_1_completed,
        target_2_completed,
        target_3_completed,
        target_4_completed,
        target_5_completed
      `),

    // Every active commander across all alliances
    supabase
      .from('commanders')
      .select('uid, name, status, inactive_flagged, alliance_id')
      .eq('status', 'active'),

    // Every flagged-inactive commander, across all alliances
    supabase
      .from('commanders')
      .select('uid, name, inactive_flagged_at, alliance_id')
      .eq('inactive_flagged', true)
      .order('inactive_flagged_at', { ascending: false })
      .limit(10),

    // Global audit log, not scoped to a single alliance
    supabase
      .from('audit_logs')
      .select(
        'id, action, performed_by_display, target_commander_uid, target_alliance_id, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const allianceCount = (alliances ?? []).length
  const activeCount = (allCommanders ?? []).length
  const inactiveCount = (inactiveMembers ?? []).length

  const ACTION_LABELS: Record<string, string> = {
    commander_created: 'Commander added',
    commander_updated: 'Commander updated',
    commander_disabled: 'Account disabled',
    role_changed: 'Role changed',
    member_added: 'Member added',
    member_removed: 'Member removed',
    transfer_approved: 'Transfer approved',
    transfer_rejected: 'Transfer rejected',
    verification_completed: 'Commander verified',
    duel_day_locked: 'Duel day locked',
    dsb_team_updated: 'DSB roster updated',
    canyon_team_updated: 'Canyon roster updated',
    dsb_attendance_recorded: 'DSB attendance recorded',
    canyon_attendance_recorded: 'Canyon attendance recorded',
    inactive_flagged: 'Inactive flag set',
    alliance_created: 'Alliance created',
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* UTC-2 Clock */}
      <UTCClock />

      {/* Welcome */}
      <div>
        <h1 className="page-title">
          Welcome, {commander?.name ?? commanderUid}
        </h1>

        <p className="page-subtitle">
          {weekKey} · SUPREME · Server-wide view
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Total Commanders
            </span>
            <span className="text-tactical-300 text-lg">👥</span>
          </div>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {activeCount}
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Alliances
            </span>
            <span className="text-tactical-300 text-lg">🏰</span>
          </div>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {allianceCount}
          </p>
        </div>

        <div
          className={`stat-card ${
            inactiveCount > 0
              ? 'border border-amber-300 bg-amber-50/40'
              : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Inactive Flags
            </span>
            <span
              className={`text-lg ${
                inactiveCount > 0 ? 'text-amber-400' : 'text-tactical-300'
              }`}
            >
              ⚠
            </span>
          </div>
          <p
            className={`text-2xl font-semibold mt-1 ${
              inactiveCount > 0 ? 'text-amber-700' : 'text-tactical-900'
            }`}
          >
            {inactiveCount}
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Current Week
            </span>
            <span className="text-tactical-300 text-lg">📅</span>
          </div>
          <p className="text-2xl font-semibold text-tactical-900 mt-1 font-mono text-lg">
            {weekKey.split('-')[1]}
          </p>
        </div>

      </div>

      {/* Inactive alert — server-wide, not single-alliance */}
      {inactiveCount > 0 && (
        <div className="glass-card p-4 border border-amber-300 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500 animate-pulse-soft">⚠</span>
            <p className="font-semibold text-amber-800 text-sm">
              {inactiveCount} Inactive Commander
              {inactiveCount !== 1 ? 's' : ''} Flagged Server-Wide
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(inactiveMembers ?? []).map((m: any) => (
              <span key={m.uid} className="badge badge-warning">
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alliance Overview Grid — one card per alliance */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-tactical-500">Server Overview</p>
            <p className="font-semibold text-tactical-900">All Alliances</p>
          </div>
          <a
            href="/admin"
            className="text-xs px-2.5 py-1 rounded-lg border border-tactical-200 text-tactical-500 hover:border-accent hover:text-accent transition-colors"
          >
            Manage →
          </a>
        </div>

        {(alliances ?? []).length === 0 ? (
          <p className="text-sm text-tactical-400">No alliances found</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(alliances ?? []).map((a: any) => {
              const memberCount = (allCommanders ?? []).filter(
                (c: any) => c.alliance_id === a.id
              ).length
              return (
                <div
                  key={a.id}
                  className="rounded-xl bg-surface-overlay p-3 flex flex-col gap-1"
                >
                  <p className="text-sm font-semibold text-tactical-900">
                    {a.tag}
                  </p>
                  <p className="text-xs text-tactical-500">
                    {memberCount}/100 members · Gift Lv {a.gift_level ?? '-'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Activity — global, across all alliances */}
      <div className="glass-card p-5">
        <p className="font-semibold text-tactical-900 mb-4">
          Recent Activity (Server-Wide)
        </p>

        {(recentLogs ?? []).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-tactical-400">No recent activity</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {(recentLogs ?? []).map((log: any) => (
              <div key={log.id} className="py-3 flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tactical-800">
                    <span className="font-medium">{log.performed_by_display}</span>
                    {' · '}
                    {ACTION_LABELS[log.action] ?? log.action}
                  </p>
                  <p className="text-xs text-tactical-400 mt-0.5">
                    {new Date(log.created_at).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}