// app/(protected)/dashboard/page.tsx

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import UTCClock from '@/components/layout/UTCClock'
import { getWeekKey } from '@/lib/utils/utc2'
import type { Role } from '@/lib/types'

export default async function DashboardPage() {
  const headersList = await headers()

  const commanderUid = headersList.get('x-commander-uid')
  const role = headersList.get('x-commander-role') as Role | null
  const allianceId = headersList.get('x-alliance-id') || null

  if (!commanderUid || !role) {
    redirect('/login')
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const weekKey = getWeekKey()

  const [
    { data: commander },
    { data: members },
    { data: inactiveMembers },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from('commanders')
      .select('name, role, status')
      .eq('uid', commanderUid)
      .single(),

    allianceId
      ? supabase
          .from('commanders')
          .select('uid, name, status, inactive_flagged')
          .eq('alliance_id', allianceId)
          .eq('status', 'active')
      : Promise.resolve({ data: [] }),

    allianceId
      ? supabase
          .from('commanders')
          .select('uid, name, inactive_flagged_at')
          .eq('alliance_id', allianceId)
          .eq('inactive_flagged', true)
          .order('inactive_flagged_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),

    allianceId
      ? supabase
          .from('audit_logs')
          .select(
            'id, action, performed_by_display, target_commander_uid, created_at'
          )
          .eq('target_alliance_id', allianceId)
          .order('created_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ])

  const activeCount = (members ?? []).length
  const inactiveCount = (inactiveMembers ?? []).length
  const isR4Plus = ['r4', 'r5', 'supreme'].includes(role)

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
          {weekKey} · {role?.toUpperCase()} ·{' '}
          {allianceId
            ? 'Alliance active'
            : 'No alliance assigned'}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Active Members
            </span>

            <span className="text-tactical-300 text-lg">
              👥
            </span>
          </div>

          <p className="text-2xl font-semibold text-tactical-900 mt-1">
            {activeCount}
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Current Week
            </span>

            <span className="text-tactical-300 text-lg">
              📅
            </span>
          </div>

          <p className="text-2xl font-semibold text-tactical-900 mt-1 font-mono text-lg">
            {weekKey.split('-')[1]}
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
                inactiveCount > 0
                  ? 'text-amber-400'
                  : 'text-tactical-300'
              }`}
            >
              ⚠
            </span>
          </div>

          <p
            className={`text-2xl font-semibold mt-1 ${
              inactiveCount > 0
                ? 'text-amber-700'
                : 'text-tactical-900'
            }`}
          >
            {inactiveCount}
          </p>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-tactical-500 font-medium">
              Alliance Status
            </span>

            <span className="text-tactical-300 text-lg">
              🏰
            </span>
          </div>

          <p className="text-sm font-semibold text-green-700 mt-1">
            Active
          </p>
        </div>
      </div>

      {/* Inactive alert */}
      {isR4Plus && inactiveCount > 0 && (
        <div className="glass-card p-4 border border-amber-300 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500 animate-pulse-soft">
              ⚠
            </span>

            <p className="font-semibold text-amber-800 text-sm">
              {inactiveCount} Inactive Commander
              {inactiveCount !== 1 ? 's' : ''} Flagged
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(inactiveMembers ?? []).map((m: any) => (
              <span
                key={m.uid}
                className="badge badge-warning"
              >
                {m.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alliance Dashboard */}
      {allianceId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Alliance Overview */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-tactical-500">
                  Alliance Overview
                </p>

                <p className="font-semibold text-tactical-900">
                  Command Center
                </p>
              </div>

              <span className="text-3xl">🏰</span>
            </div>

            <div className="grid grid-cols-2 gap-3">

              <div className="rounded-xl bg-surface-overlay p-3 text-center">
                <p className="text-xs text-tactical-500">
                  Members
                </p>

                <p className="text-xl font-semibold text-tactical-900">
                  {activeCount}/100
                </p>
              </div>

              <div className="rounded-xl bg-surface-overlay p-3 text-center">
                <p className="text-xs text-tactical-500">
                  Gift Level
                </p>

                <p className="text-xl font-semibold text-tactical-900">
                  20
                </p>
              </div>

              <div className="rounded-xl bg-surface-overlay p-3 text-center">
                <p className="text-xs text-tactical-500">
                  Alliance Rank
                </p>

                <p className="text-xl font-semibold text-green-700">
                  #1
                </p>
              </div>

              <div className="rounded-xl bg-surface-overlay p-3 text-center">
                <p className="text-xs text-tactical-500">
                  Status
                </p>

                <p className="text-xl font-semibold text-green-700">
                  Active
                </p>
              </div>

            </div>
          </div>

          {/* Weekly Objectives */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-tactical-500">
                  Weekly Objectives
                </p>

                <p className="font-semibold text-tactical-900">
                  Alliance Targets
                </p>
              </div>

              <span className="text-3xl">🎯</span>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { done: true, text: 'Maintain 95+ active members' },
                { done: true, text: 'Secure weekly Dual victory' },
                { done: false, text: 'Recruit new members' },
                { done: false, text: 'Increase alliance activity' },
                { done: false, text: 'Complete weekly objectives' },
              ].map((obj, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={obj.done ? 'text-green-500' : 'text-amber-500'}>
                    {obj.done ? '✓' : '○'}
                  </span>

                  <span className="text-sm text-tactical-800">
                    {obj.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Recent Activity */}
      <div className="glass-card p-5">
        <p className="font-semibold text-tactical-900 mb-4">
          Recent Activity
        </p>

        {(recentLogs ?? []).length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-tactical-400">
              No recent activity
            </p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-tactical-100">
            {(recentLogs ?? []).map((log: any) => (
              <div
                key={log.id}
                className="py-3 flex items-start gap-3"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tactical-800">
                    <span className="font-medium">
                      {log.performed_by_display}
                    </span>
                    {' · '}
                    {ACTION_LABELS[log.action] ?? log.action}
                  </p>

                  <p className="text-xs text-tactical-400 mt-0.5">
                    {new Date(log.created_at).toLocaleString(
                      'en-GB',
                      {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )}
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