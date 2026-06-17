// app/(protected)/alliance/[id]/duel/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey, getWeekStart } from '@/lib/utils/utc2'
import Link                  from 'next/link'
import type { Role }         from '@/lib/types'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  passed:        'badge-active',
  below_minimum: 'badge-warning',
  absent:        'badge-disabled',
  skipped:       'badge-inactive',
}

export default async function DuelPage({
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
  const weekKey  = getWeekKey()

  // Get or note absence of current week
  const { data: duelWeek } = await supabase
    .from('duel_weeks')
    .select('*')
    .eq('alliance_id', allianceId)
    .eq('week_key', weekKey)
    .single()

  // Get entries for this week if week exists
  let entries: any[] = []
  if (duelWeek) {
    const { data } = await supabase
      .from('duel_entries')
      .select('*')
      .eq('duel_week_id', duelWeek.id)
    entries = data ?? []
  }

  // Get alliance members
  const { data: members } = await supabase
    .from('commanders')
    .select('uid, name, role, status')
    .eq('alliance_id', allianceId)
    .eq('status', 'active')
    .order('name')

  // Get past weeks
  const { data: pastWeeks } = await supabase
    .from('duel_weeks')
    .select('id, week_key, mode, minimum_score, created_at')
    .eq('alliance_id', allianceId)
    .order('week_key', { ascending: false })
    .limit(8)

  const isR4Plus = ['r4','r5','supreme'].includes(role)
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday'] as const

  // Calculate stats per day
  const dayStats = days.map(day => {
    const dayEntries = entries.filter(e => e.day === day)
    const locked     = dayEntries.some(e => e.day_locked)
    const passed     = dayEntries.filter(e => e.status === 'passed').length
    const below      = dayEntries.filter(e => e.status === 'below_minimum').length
    const absent     = dayEntries.filter(e => e.status === 'absent').length
    return { day, locked, passed, below, absent, total: dayEntries.length }
  })

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Alliance VS Duel</h1>
          <p className="page-subtitle">{weekKey} · {duelWeek?.mode ?? 'No week started'}</p>
        </div>
        {isR4Plus && (
          <Link href={`/alliance/${allianceId}/duel/entry`} className="btn-primary">
            {duelWeek ? 'Enter Scores' : 'Start Week'}
          </Link>
        )}
      </div>

      {/* Week summary */}
      {duelWeek ? (
        <>
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-tactical-900">Week {weekKey}</p>
                <p className="text-sm text-tactical-500 mt-0.5">
                  Mode: <span className="font-medium capitalize">{duelWeek.mode}</span>
                  {duelWeek.minimum_score && (
                    <span className="ml-2">· Min: <span className="font-medium font-mono">
                      {(duelWeek.minimum_score / 1_000_000).toFixed(0)}M
                    </span></span>
                  )}
                </p>
              </div>
              <span className="badge badge-active">{weekKey}</span>
            </div>

            {/* Day cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {dayStats.map(({ day, locked, passed, below, absent }) => (
                <div key={day}
                     className={`p-3 rounded-xl border ${locked
                       ? 'bg-accent-light border-accent/30'
                       : 'bg-surface-overlay border-tactical-200'
                     }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-tactical-700 capitalize">{day}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-tactical-500">
                        +{DUEL_POINT_VALUES[day]}pt
                      </span>
                      {locked && <span className="text-xs text-accent-deep">✓</span>}
                    </div>
                  </div>
                  {locked ? (
                    <div className="flex gap-2 text-xs">
                      <span className="text-accent-deep font-medium">{passed}✓</span>
                      {below > 0 && <span className="text-amber-600 font-medium">{below}⚠</span>}
                      {absent > 0 && <span className="text-red-500 font-medium">{absent}✗</span>}
                    </div>
                  ) : (
                    <p className="text-xs text-tactical-400">Not entered</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card p-8 text-center">
          <p className="text-2xl mb-3">◎</p>
          <p className="font-semibold text-tactical-900">No duel week started</p>
          <p className="text-sm text-tactical-500 mt-1">
            {isR4Plus ? 'Click "Start Week" to begin tracking.' : 'Waiting for R4/R5 to start the week.'}
          </p>
        </div>
      )}

      {/* Points reference */}
      <div className="glass-card p-5">
        <p className="font-semibold text-tactical-900 mb-3">Weekly Schedule</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {days.map(day => (
            <div key={day} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-overlay">
              <p className="text-xs text-tactical-700 capitalize">{DUEL_DAY_NAMES[day]}</p>
              <span className="badge badge-active text-xs font-mono">+{DUEL_POINT_VALUES[day]}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 p-2.5 rounded-xl bg-accent-light border border-accent/20 flex justify-between">
          <span className="text-sm font-semibold text-accent-deep">Total / Victory</span>
          <span className="text-sm font-bold text-accent-deep font-mono">13 pts / 7+ pts</span>
        </div>
      </div>

      {/* Past weeks */}
      {(pastWeeks ?? []).length > 1 && (
        <div className="glass-card p-5">
          <p className="font-semibold text-tactical-900 mb-3">Past Weeks</p>
          <div className="flex flex-col divide-y divide-tactical-100">
            {(pastWeeks ?? []).filter(w => w.week_key !== weekKey).map((w: any) => (
              <div key={w.id} className="py-2.5 flex items-center justify-between">
                <p className="text-sm font-medium text-tactical-900 font-mono">{w.week_key}</p>
                <div className="flex items-center gap-2">
                  <span className="badge badge-inactive capitalize">{w.mode}</span>
                  {w.minimum_score && (
                    <span className="text-xs text-tactical-500 font-mono">
                      {(w.minimum_score / 1_000_000).toFixed(0)}M min
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}