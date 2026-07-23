// app/(protected)/dashboard/page.tsx

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import UTCClock from '@/components/layout/UTCClock'
import AllianceOverviewCard from '@/components/dashboard/AllianceOverviewCard'
import AllianceTargetsCard from '@/components/dashboard/AllianceTargetsCard'
import AllianceAlertWidget from '@/components/dashboard/AllianceAlertWidget'
import AlertHistoryPanel   from '@/components/dashboard/AlertHistoryPanel'
import { getCurrentSeasonLabel } from '@/lib/utils/utc2'
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
  const weekLabel = getCurrentSeasonLabel() // e.g. "S-35 W1" — was raw ISO "W30"

  const [
    { data: commander },
    { data: alliance },
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
          .from('alliances')
          .select(`
            tag,
            name,
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
          `)
          .eq('id', allianceId)
          .single()
      : Promise.resolve({ data: null }),

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
  const canEditAlliance = role === 'r4' || role === 'r5' || role === 'supreme'
  const canRenameAlliance = role === 'r5' || role === 'supreme'

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

  const targetSlots = [
    { text: alliance?.target_1 ?? '', completed: !!alliance?.target_1_completed },
    { text: alliance?.target_2 ?? '', completed: !!alliance?.target_2_completed },
    { text: alliance?.target_3 ?? '', completed: !!alliance?.target_3_completed },
    { text: alliance?.target_4 ?? '', completed: !!alliance?.target_4_completed },
    { text: alliance?.target_5 ?? '', completed: !!alliance?.target_5_completed },
  ]

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* UTC-2 Clock — now also shows the current week label */}
      <UTCClock weekLabel={weekLabel} />

      {/* Welcome */}
      <div>
        <h1 className="page-title">
          Welcome, {commander?.name ?? commanderUid}
        </h1>

        <p className="page-subtitle">
          {weekLabel} · {role?.toUpperCase()} ·{' '}
          {allianceId ? 'Alliance active' : 'No alliance assigned'}
        </p>
      </div>

      {/* Alliance Alert — replaces the old Canyon-toggle badge and the
          Active Members / Inactive Flags stat row. activeCount/inactiveCount
          are still computed above and still feed the flagged-commanders
          banner below and AllianceOverviewCard's activeCount prop. */}
      {allianceId && <AllianceAlertWidget allianceId={allianceId} />}
      {allianceId && <AlertHistoryPanel allianceId={allianceId} />}

      {/* Inactive alert */}
      {isR4Plus && inactiveCount > 0 && (
        <div className="glass-card p-4 border border-amber-300 bg-amber-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500 animate-pulse-soft">⚠</span>
            <p className="font-semibold text-amber-800 text-sm">
              {inactiveCount} Inactive Commander
              {inactiveCount !== 1 ? 's' : ''} Flagged
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

      {/* Alliance Dashboard */}
      {allianceId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <AllianceOverviewCard
            allianceId={allianceId}
            activeCount={activeCount}
            initialGiftLevel={alliance?.gift_level ?? null}
            initialTag={alliance?.tag ?? ''}
            initialName={alliance?.name ?? ''}
            canEdit={canEditAlliance}
            canRename={canRenameAlliance}
          />

          <AllianceTargetsCard
            allianceId={allianceId}
            initialTargets={targetSlots}
            canEdit={canEditAlliance}
          />

        </div>
      )}

      {/* Recent Activity */}
      <div className="glass-card p-5">
        <p className="font-semibold text-tactical-900 mb-4">Recent Activity</p>

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