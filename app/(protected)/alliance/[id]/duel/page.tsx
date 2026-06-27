// app/(protected)/alliance/[id]/duel/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey }        from '@/lib/utils/utc2'
import Link                  from 'next/link'
import type { Role }         from '@/lib/types'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES } from '@/lib/types'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday'] as const

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

  const { data: duelWeek } = await supabase
    .from('duel_weeks')
    .select('*')
    .eq('alliance_id', allianceId)
    .eq('week_key', weekKey)
    .single()

  let entries: any[] = []
  if (duelWeek) {
    const { data } = await supabase
      .from('duel_entries')
      .select('*')
      .eq('duel_week_id', duelWeek.id)
    entries = data ?? []
  }

  const { data: members } = await supabase
    .from('commanders')
    .select('uid, name, role, status')
    .eq('alliance_id', allianceId)
    .eq('status', 'active')
    .order('name')

  const { data: pastWeeks } = await supabase
    .from('duel_weeks')
    .select('id, week_key, mode, minimum_score, created_at')
    .eq('alliance_id', allianceId)
    .order('week_key', { ascending: false })
    .limit(8)

  const isR4Plus = ['r4','r5','supreme'].includes(role)

  const dayStats = DAYS.map(day => {
    const dayEntries = entries.filter(e => e.day === day)
    const locked     = dayEntries.some(e => e.day_locked)
    const passed     = dayEntries.filter(e => e.status === 'passed').length
    const below      = dayEntries.filter(e => e.status === 'below_minimum').length
    const absent     = dayEntries.filter(e => e.status === 'absent').length
    return { day, locked, passed, below, absent, total: dayEntries.length }
  })

  // Build per-member score table
  const memberRows = (members ?? []).map(member => {
    const dayResults = DAYS.map(day => {
      const entry = entries.find(e => e.commander_uid === member.uid && e.day === day)
      const locked = entries.filter(e => e.day === day).some(e => e.day_locked)
      if (!locked) return 'pending'
      if (!entry)  return 'absent'
      return entry.status // passed | below_minimum | absent
    })
    const points = dayResults.reduce((sum, status, i) => {
      if (status === 'passed') return sum + DUEL_POINT_VALUES[DAYS[i]]
      return sum
    }, 0)
    const passed = dayResults.filter(s => s === 'passed').length
    const absent = dayResults.filter(s => s === 'absent').length
    const below  = dayResults.filter(s => s === 'below_minimum').length
    return { ...member, dayResults, points, passed, absent, below }
  }).sort((a, b) => b.points - a.points)

  const lockedDays = DAYS.filter(day => entries.filter(e => e.day === day).some(e => e.day_locked))

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

      {duelWeek ? (
        <>
          {/* Day summary cards */}
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
              <span className="badge badge-active">{lockedDays.length}/6 days locked</span>
            </div>

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
                      <span className="text-xs font-mono text-tactical-500">+{DUEL_POINT_VALUES[day]}pt</span>
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

          {/* Per-member score table */}
          {memberRows.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-tactical-900">Member Scores — {weekKey}</p>
                <p className="text-xs text-tactical-500">{lockedDays.length} day{lockedDays.length !== 1 ? 's' : ''} recorded</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-tactical-100">
                      <th className="text-left py-2 pr-3 text-tactical-500 font-medium w-8">#</th>
                      <th className="text-left py-2 pr-3 text-tactical-500 font-medium min-w-[120px]">Commander</th>
                      {DAYS.map(day => (
                        <th key={day} className="text-center py-2 px-1 text-tactical-500 font-medium w-12">
                          <span className="capitalize">{day.slice(0,3)}</span>
                          <span className="block font-mono text-[10px] text-tactical-400">+{DUEL_POINT_VALUES[day]}</span>
                        </th>
                      ))}
                      <th className="text-center py-2 pl-3 text-tactical-500 font-medium w-16">Pts</th>
                      <th className="text-center py-2 pl-2 text-tactical-500 font-medium w-12">✓</th>
                      <th className="text-center py-2 pl-2 text-tactical-500 font-medium w-12">✗</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.map((member, idx) => (
                      <tr key={member.uid}
                          className="border-b border-tactical-50 hover:bg-surface-overlay/50 transition-colors">
                        <td className="py-2 pr-3 text-tactical-400 font-mono">{idx + 1}</td>
                        <td className="py-2 pr-3 font-medium text-tactical-900">{member.name}</td>
                        {member.dayResults.map((status, i) => (
                          <td key={i} className="py-2 px-1 text-center">
                            {status === 'passed'        && <span className="text-accent-deep">✓</span>}
                            {status === 'below_minimum' && <span className="text-amber-500">⚠</span>}
                            {status === 'absent'        && <span className="text-red-400">✗</span>}
                            {status === 'pending'       && <span className="text-tactical-300">·</span>}
                          </td>
                        ))}
                        <td className="py-2 pl-3 text-center font-bold font-mono text-tactical-900">
                          {member.points}
                        </td>
                        <td className="py-2 pl-2 text-center text-accent-deep font-medium">{member.passed}</td>
                        <td className="py-2 pl-2 text-center text-red-400 font-medium">{member.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-tactical-100">
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-accent-deep">✓</span> Passed
                </span>
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-amber-500">⚠</span> Below min
                </span>
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-red-400">✗</span> Absent
                </span>
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-tactical-300">·</span> Pending
                </span>
              </div>
            </div>
          )}
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
          {DAYS.map(day => (
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