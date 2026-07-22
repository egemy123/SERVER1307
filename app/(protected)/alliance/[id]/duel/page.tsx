// app/(protected)/alliance/[id]/duel/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey, getSeasonLabel } from '@/lib/utils/utc2'
import Link                  from 'next/link'
import type { Role, DuelResult } from '@/lib/types'
import { DUEL_DAY_NAMES, DUEL_POINT_VALUES, pointsForDay } from '@/lib/types'

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday'] as const

// Analytics warning levels are based on TOTAL participation issues
// (absent + below-minimum combined) for a quick at-a-glance risk read —
// but the two counts are always displayed separately, never blended into
// one number, per explicit requirement.
const WARNING_LEVEL = (total: number) => {
  if (total >= 5) return { label: 'Red',    color: 'text-red-600',    bg: 'bg-red-50 border-red-200' }
  if (total >= 3) return { label: 'Orange', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' }
  if (total >= 1) return { label: 'Yellow', color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' }
  return                   { label: 'Green',  color: 'text-accent-deep', bg: 'bg-accent-light border-accent/20' }
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
  const isR4Plus = ['r4','r5','supreme'].includes(role)

  const { data: duelWeek } = await supabase
    .from('duel_weeks')
    .select('*')
    .eq('alliance_id', allianceId)
    .eq('week_key', weekKey)
    .single()

  let entries: any[]    = []
  let dayResults: any[] = []
  if (duelWeek) {
    const [{ data: entryData }, { data: resultData }] = await Promise.all([
      supabase.from('duel_entries').select('*').eq('duel_week_id', duelWeek.id),
      supabase.from('duel_day_results').select('*').eq('duel_week_id', duelWeek.id),
    ])
    entries    = entryData ?? []
    dayResults = resultData ?? []
  }

  const { data: members } = await supabase
    .from('commanders')
    .select('uid, name, role, status')
    .eq('alliance_id', allianceId)
    .eq('status', 'active')
    .order('name')

  const { data: pastWeeks } = await supabase
    .from('duel_weeks')
    .select('id, week_key, mode, created_at, week_start')
    .eq('alliance_id', allianceId)
    .order('week_key', { ascending: false })
    .limit(8)

  // ── Join dates — for the mid-week-join concession below. Uses the
  // EARLIEST joined_at per commander for this alliance (their first-ever
  // stint here), which is the right cutoff for "hadn't joined yet" even
  // for someone who has since left and rejoined.
  const { data: historyRows } = await supabase
    .from('alliance_history')
    .select('commander_uid, joined_at')
    .eq('alliance_id', allianceId)
    .order('joined_at', { ascending: true })

  const earliestJoinByUid = new Map<string, string>()
  for (const row of (historyRows ?? [])) {
    if (!earliestJoinByUid.has(row.commander_uid)) {
      earliestJoinByUid.set(row.commander_uid, row.joined_at)
    }
  }

  /** Calendar date of a given day-index (0=Monday...5=Saturday) within a
   *  week, given that week's week_start (always a Monday, see getWeekStart). */
  function dayDateForIndex(weekStartIso: string, dayIndex: number): Date {
    const d = new Date(weekStartIso)
    d.setUTCDate(d.getUTCDate() + dayIndex)
    return d
  }

  // Result-per-day lookup for point math — the ONLY source of duel points
  const resultByDay = new Map<string, DuelResult>(
    dayResults.map((r: any) => [r.day, r.result as DuelResult])
  )

  const dayStats = DAYS.map(day => {
    const dayEntries = entries.filter(e => e.day === day)
    const locked     = dayEntries.some(e => e.day_locked)
    const passed     = dayEntries.filter(e => e.status === 'passed').length
    const below      = dayEntries.filter(e => e.status === 'below_minimum').length
    const absent     = dayEntries.filter(e => e.status === 'absent').length
    const result     = resultByDay.get(day) ?? null
    return { day, locked, passed, below, absent, total: dayEntries.length, result }
  })

  const weekPoints = dayStats.reduce((sum, d) => sum + pointsForDay(d.day, d.result), 0)

  // Build per-member row — performance breakdown (informational) is separate from points
  const memberRowsAll = (members ?? []).map(member => {
    const joinedAtStr = earliestJoinByUid.get(member.uid)
    const joinedDate  = joinedAtStr ? new Date(joinedAtStr) : null

    const dayResultsForMember = DAYS.map((day, dayIdx) => {
      // Mid-week join concession: if this day's calendar date is before the
      // commander even joined the alliance, it's neither a pass, a below-
      // minimum, nor an absence — they simply weren't here yet. Shown as a
      // distinct marker and excluded from their counts below entirely.
      if (joinedDate && duelWeek?.week_start) {
        const dayDate = dayDateForIndex(duelWeek.week_start, dayIdx)
        if (dayDate < joinedDate) return 'not_yet_joined'
      }
      const entry  = entries.find(e => e.commander_uid === member.uid && e.day === day)
      const locked = entries.filter(e => e.day === day).some(e => e.day_locked)
      if (!locked) return 'pending'
      if (!entry)  return 'absent'
      return entry.status // passed | below_minimum | absent
    })
    const passed = dayResultsForMember.filter(s => s === 'passed').length
    const absent = dayResultsForMember.filter(s => s === 'absent').length
    const below  = dayResultsForMember.filter(s => s === 'below_minimum').length
    const rawScoreTotal = entries
      .filter(e => e.commander_uid === member.uid && e.day_locked && typeof e.score === 'number')
      .reduce((sum, e) => sum + (e.score ?? 0), 0)
    return { ...member, dayResults: dayResultsForMember, passed, absent, below, rawScoreTotal }
  })

  // Ranked by score descending — highest score first. Ties broken by name
  // so ordering stays stable rather than shuffling on every reload.
  memberRowsAll.sort((a, b) => b.rawScoreTotal - a.rawScoreTotal || a.name.localeCompare(b.name))

  // ── Visibility: normal members only see their own row; leadership sees everyone ──
  const memberRows = isR4Plus
    ? memberRowsAll
    : memberRowsAll.filter(m => m.uid === commanderUid)

  const lockedDays = DAYS.filter(day => entries.filter(e => e.day === day).some(e => e.day_locked))

  // Detailed Mode leaderboard — raw 6-day score sum, ranked, leadership + full mode only
  const leaderboard = duelWeek?.mode === 'full'
    ? [...memberRowsAll].sort((a, b) => b.rawScoreTotal - a.rawScoreTotal)
    : []

  const activeUids = new Set((members ?? []).map(m => m.uid))
  const membersByUid = new Map((members ?? []).map(m => [m.uid, m.name]))
  const otherPastWeeks = (pastWeeks ?? []).filter(w => w.week_key !== weekKey)
  const pastWeekIds = otherPastWeeks.map(w => w.id)

  const { data: pastEntries } = pastWeekIds.length > 0
    ? await supabase
        .from('duel_entries')
        .select('duel_week_id, commander_uid, score, day, status, day_locked')
        .in('duel_week_id', pastWeekIds)
    : { data: [] as any[] }

  // ── Former members — anyone with data (this week or past weeks) who has
  // since left the alliance. Their commanders.alliance_id no longer points
  // here, so a plain uid lookup (no alliance filter) is needed for names —
  // one query covers every former member this whole page needs.
  const currentWeekFormerUids = new Set(
    entries.map(e => e.commander_uid).filter(uid => !activeUids.has(uid))
  )
  const pastWeeksFormerUids = new Set(
    (pastEntries ?? []).map(e => e.commander_uid).filter(uid => !activeUids.has(uid))
  )
  const allFormerUids = Array.from(new Set([...currentWeekFormerUids, ...pastWeeksFormerUids]))

  const { data: formerCommanders } = allFormerUids.length > 0
    ? await supabase.from('commanders').select('uid, name').in('uid', allFormerUids)
    : { data: [] as any[] }

  const formerNameByUid = new Map((formerCommanders ?? []).map(c => [c.uid, c.name]))
  const nameForUid = (uid: string) => membersByUid.get(uid) ?? formerNameByUid.get(uid) ?? uid

  // Former members' rows for the CURRENT week — same per-day breakdown as
  // active members, but never ranked/numbered and always listed last.
  const leftMemberRowsCurrent = Array.from(currentWeekFormerUids).map(uid => {
    const dayResultsForMember = DAYS.map(day => {
      const entry  = entries.find(e => e.commander_uid === uid && e.day === day)
      const locked = entries.filter(e => e.day === day).some(e => e.day_locked)
      if (!locked) return 'pending'
      if (!entry)  return 'absent'
      return entry.status
    })
    const passed = dayResultsForMember.filter(s => s === 'passed').length
    const absent = dayResultsForMember.filter(s => s === 'absent').length
    const below  = dayResultsForMember.filter(s => s === 'below_minimum').length
    const rawScoreTotal = entries
      .filter(e => e.commander_uid === uid && e.day_locked && typeof e.score === 'number')
      .reduce((sum, e) => sum + (e.score ?? 0), 0)
    return { uid, name: nameForUid(uid), dayResults: dayResultsForMember, passed, absent, below, rawScoreTotal }
  }).sort((a, b) => a.name.localeCompare(b.name))

  // ── Past Seasons — FULL per-member detail (day-by-day breakdown + score,
  // same shape as the current week's table), active members ranked/numbered,
  // former members appended at the bottom unranked.
  const pastSeasonLeaderboards = otherPastWeeks.map(week => {
    const weekEntries = (pastEntries ?? []).filter(e => e.duel_week_id === week.id)
    const uidsThisWeek = new Set(weekEntries.map(e => e.commander_uid))

    const allRows = Array.from(uidsThisWeek).map(uid => {
      const dayResultsForMember = DAYS.map(day => {
        const entry  = weekEntries.find(e => e.commander_uid === uid && e.day === day)
        const locked = weekEntries.filter(e => e.day === day).some(e => e.day_locked)
        if (!locked) return 'pending'
        if (!entry)  return 'absent'
        return entry.status
      })
      const passed = dayResultsForMember.filter(s => s === 'passed').length
      const absent = dayResultsForMember.filter(s => s === 'absent').length
      const below  = dayResultsForMember.filter(s => s === 'below_minimum').length
      const score  = weekEntries
        .filter(e => e.commander_uid === uid && e.day_locked && typeof e.score === 'number')
        .reduce((sum, e) => sum + (e.score ?? 0), 0)
      return {
        uid, name: nameForUid(uid), dayResults: dayResultsForMember,
        passed, absent, below, score, leftAlliance: !activeUids.has(uid),
      }
    }).sort((a, b) => b.score - a.score)

    const ranked   = allRows.filter(r => !r.leftAlliance)
    const leftRows = allRows.filter(r => r.leftAlliance)
    return {
      weekKey: week.week_key,
      seasonLabel: getSeasonLabel(week.week_start),
      mode: week.mode,
      ranked,
      leftRows,
    }
  })

  // ── Score Trend — last 4 weeks (current + up to 3 most recent full-mode
  // past weeks), per active commander, with a simple up/down/flat indicator
  // comparing this week's score to the immediately previous recorded week.
  const trendFullWeeks = [
    ...(duelWeek?.mode === 'full'
      ? [{ weekKey, seasonLabel: getSeasonLabel(duelWeek.week_start), scoresByUid: new Map(memberRowsAll.map(m => [m.uid, m.rawScoreTotal])) }]
      : []),
    ...pastSeasonLeaderboards
      .filter(s => s.mode === 'full')
      .map(s => ({
        weekKey: s.weekKey,
        seasonLabel: s.seasonLabel,
        scoresByUid: new Map(s.ranked.map(r => [r.uid, r.score] as [string, number])),
      })),
  ].slice(0, 4) // current + up to 3 past

  // Oldest-to-newest for display, so the trend reads left-to-right chronologically
  const trendWeeksChrono = [...trendFullWeeks].reverse()

  const scoreTrendRows = trendFullWeeks.length >= 2
    ? (members ?? []).map(m => {
        const scores = trendWeeksChrono.map(w => w.scoresByUid.get(m.uid) ?? null)
        const latest = scores[scores.length - 1]
        const previous = scores.length >= 2 ? scores[scores.length - 2] : null
        const trend = (latest !== null && previous !== null)
          ? (latest > previous ? 'up' : latest < previous ? 'down' : 'flat')
          : null
        return { uid: m.uid, name: m.name, scores, trend }
      }).filter(r => r.scores.some(s => s !== null)) // only show commanders with at least one recorded score
      .sort((a, b) => (b.scores[b.scores.length - 1] ?? -1) - (a.scores[a.scores.length - 1] ?? -1))
    : []

  // ── Analytics: cumulative absent vs below-minimum counts across ALL
  // historical weeks — tracked SEPARATELY, never combined into one number.
  // Same mid-week-join concession as the current week's grid: any day
  // before a commander's join date is excluded entirely, not counted as
  // an absence or a below-minimum.
  const { data: allEntries } = await supabase
    .from('duel_entries')
    .select('commander_uid, status, day, duel_week_id, duel_weeks!inner(alliance_id, week_key, week_start)')
    .eq('duel_weeks.alliance_id', allianceId)
    .in('status', ['below_minimum', 'absent'])

  const absentCountByUid  = new Map<string, number>()
  const belowMinCountByUid = new Map<string, number>()
  for (const row of (allEntries ?? [])) {
    const joinedAtStr = earliestJoinByUid.get(row.commander_uid)
    const weekStartStr = (row as any).duel_weeks?.week_start
    if (joinedAtStr && weekStartStr) {
      const dayIdx = DAYS.indexOf(row.day as any)
      if (dayIdx !== -1) {
        const entryDate = dayDateForIndex(weekStartStr, dayIdx)
        if (entryDate < new Date(joinedAtStr)) continue // concession — wasn't a member yet
      }
    }
    const target = row.status === 'absent' ? absentCountByUid : belowMinCountByUid
    target.set(row.commander_uid, (target.get(row.commander_uid) ?? 0) + 1)
  }

  const analyticsRowsAll = (members ?? [])
    .map(m => {
      const absent = absentCountByUid.get(m.uid) ?? 0
      const belowMin = belowMinCountByUid.get(m.uid) ?? 0
      return { uid: m.uid, name: m.name, absent, belowMin, total: absent + belowMin }
    })
    .sort((a, b) => b.total - a.total)

  const analyticsRows = isR4Plus
    ? analyticsRowsAll
    : analyticsRowsAll.filter(r => r.uid === commanderUid)

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Alliance VS Duel</h1>
          <p className="page-subtitle">
            {duelWeek ? getSeasonLabel(duelWeek.week_start) : weekKey} · {duelWeek?.mode === 'full' ? 'Detailed' : duelWeek?.mode === 'quick' ? 'Simple' : 'No week started'}
          </p>
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
                <p className="font-semibold text-tactical-900">{getSeasonLabel(duelWeek.week_start)}</p>
                <p className="text-sm text-tactical-500 mt-0.5">
                  Mode: <span className="font-medium capitalize">{duelWeek.mode === 'full' ? 'Detailed' : 'Simple'}</span>
                  <span className="ml-2">· Alliance Points: <span className="font-bold font-mono text-accent-deep">{weekPoints}</span></span>
                </p>
              </div>
              <span className="badge badge-active">{lockedDays.length}/6 days locked</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {dayStats.map(({ day, locked, passed, below, absent, result }) => (
                <div key={day}
                     className={`p-3 rounded-xl border ${locked
                       ? result === 'victory' ? 'bg-accent-light border-accent/30' : 'bg-red-50 border-red-200'
                       : 'bg-surface-overlay border-tactical-200'
                     }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-tactical-700 capitalize">{day}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-tactical-500">+{DUEL_POINT_VALUES[day]}pt</span>
                      {locked && <span className="text-xs">{result === 'victory' ? '🏆' : '💔'}</span>}
                    </div>
                  </div>
                  {locked ? (
                    <div className="flex flex-col gap-1">
                      <p className={`text-xs font-bold ${result === 'victory' ? 'text-accent-deep' : 'text-red-600'}`}>
                        {result === 'victory' ? `Victory · +${DUEL_POINT_VALUES[day]} pts` : 'Defeat · +0 pts'}
                      </p>
                      <div className="flex gap-2 text-[11px]">
                        <span className="text-accent-deep font-medium">{passed}✓</span>
                        {below > 0 && <span className="text-amber-600 font-medium">{below}⚠</span>}
                        {absent > 0 && <span className="text-red-500 font-medium">{absent}✗</span>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-tactical-400">Not entered</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-tactical-500 mt-3">
              Passed/below-minimum/absent counts above are participation tracking only — they never
              affect points. Only the Victory/Defeat result per day determines Alliance Points.
            </p>
          </div>

          {/* Per-member score table (own row only for normal members) — collapsed
              by default so the page isn't a wall of data on load */}
          {memberRows.length > 0 && (
            <details className="glass-card p-5 group">
              <summary className="flex items-center justify-between cursor-pointer select-none list-none">
                <p className="font-semibold text-tactical-900 flex items-center gap-2">
                  <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400 text-xs">▶</span>
                  {isR4Plus ? `Member Scores — ${getSeasonLabel(duelWeek.week_start)}` : 'Your Scores — ' + getSeasonLabel(duelWeek.week_start)}
                </p>
                <p className="text-xs text-tactical-500">{lockedDays.length} day{lockedDays.length !== 1 ? 's' : ''} recorded</p>
              </summary>

              <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-tactical-100">
                      <th className="text-left py-2 pr-3 text-tactical-500 font-medium w-8">#</th>
                      <th className="text-left py-2 pr-3 text-tactical-500 font-medium min-w-[120px]">Commander</th>
                      {DAYS.map((day, i) => (
                        <th key={day} className="text-center py-2 px-1 text-tactical-500 font-medium w-12">
                          <span>D{i + 1}</span>
                        </th>
                      ))}
                      {duelWeek.mode === 'full' && (
                        <th className="text-center py-2 pl-3 text-tactical-500 font-medium w-16">Score</th>
                      )}
                      <th className="text-center py-2 pl-2 text-tactical-500 font-medium w-12">✓</th>
                      <th className="text-center py-2 pl-2 text-tactical-500 font-medium w-12">✗</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberRows.map((member, idx) => (
                      <tr key={member.uid}
                          className={`border-b border-tactical-50 transition-colors ${
                            member.uid === commanderUid ? 'bg-accent-light/40' : 'hover:bg-surface-overlay/50'
                          }`}>
                        <td className="py-2 pr-3 text-tactical-400 font-mono">{idx + 1}</td>
                        <td className="py-2 pr-3 font-medium text-tactical-900">{member.name}</td>
                        {member.dayResults.map((status, i) => (
                          <td key={i} className="py-2 px-1 text-center">
                            {status === 'passed'        && <span className="text-accent-deep">✓</span>}
                            {status === 'below_minimum' && <span className="text-amber-500">⚠</span>}
                            {status === 'absent'        && <span className="text-red-400">✗</span>}
                            {status === 'pending'       && <span className="text-tactical-300">·</span>}
                            {status === 'not_yet_joined' && (
                              <span className="text-accent-deep/60" title="Not yet a member — not counted">–</span>
                            )}
                          </td>
                        ))}
                        {duelWeek.mode === 'full' && (
                          <td className="py-2 pl-3 text-center font-bold font-mono text-tactical-900">
                            {member.rawScoreTotal.toLocaleString()}
                          </td>
                        )}
                        <td className="py-2 pl-2 text-center text-accent-deep font-medium">{member.passed}</td>
                        <td className="py-2 pl-2 text-center text-red-400 font-medium">{member.absent}</td>
                      </tr>
                    ))}

                    {/* Former members — left the alliance since this week; shown for
                        transparency but never ranked/numbered like active members */}
                    {isR4Plus && leftMemberRowsCurrent.map(member => (
                      <tr key={member.uid} className="border-b border-tactical-50 opacity-60">
                        <td className="py-2 pr-3 text-tactical-300 font-mono">—</td>
                        <td className="py-2 pr-3 font-medium text-tactical-600 italic">
                          {member.name} <span className="not-italic text-[10px] text-tactical-400">(left alliance)</span>
                        </td>
                        {member.dayResults.map((status, i) => (
                          <td key={i} className="py-2 px-1 text-center">
                            {status === 'passed'        && <span className="text-accent-deep">✓</span>}
                            {status === 'below_minimum' && <span className="text-amber-500">⚠</span>}
                            {status === 'absent'        && <span className="text-red-400">✗</span>}
                            {status === 'pending'       && <span className="text-tactical-300">·</span>}
                          </td>
                        ))}
                        {duelWeek.mode === 'full' && (
                          <td className="py-2 pl-3 text-center font-bold font-mono text-tactical-600">
                            {member.rawScoreTotal.toLocaleString()}
                          </td>
                        )}
                        <td className="py-2 pl-2 text-center text-accent-deep font-medium">{member.passed}</td>
                        <td className="py-2 pl-2 text-center text-red-400 font-medium">{member.absent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-tactical-100 flex-wrap">
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-accent-deep">✓</span> Passed min
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
                <span className="text-xs text-tactical-500 flex items-center gap-1">
                  <span className="text-accent-deep/60">–</span> Not yet joined
                </span>
              </div>
              </div>
            </details>
          )}

          {/* Detailed Mode leaderboard — raw score sum, ranked, leadership only,
              plus expandable past-season leaderboards below it. Collapsed by
              default along with everything else dense on this page. */}
          {isR4Plus && (leaderboard.length > 0 || pastSeasonLeaderboards.length > 0) && (
            <details className="glass-card p-5 group">
              <summary className="flex items-center justify-between cursor-pointer select-none list-none">
                <p className="font-semibold text-tactical-900 flex items-center gap-2">
                  <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400 text-xs">▶</span>
                  Leaderboard
                </p>
                <p className="text-xs text-tactical-500">Ranked by raw 6-day score total</p>
              </summary>

              <div className="mt-4">
              {duelWeek?.mode === 'full' && leaderboard.length > 0 && (
                <>
                  <p className="text-xs font-medium text-tactical-500 uppercase tracking-wide mb-2">
                    {getSeasonLabel(duelWeek.week_start)} — Current
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                    {leaderboard.slice(0, 20).map((m, i) => (
                      <div key={m.uid} className="flex items-center justify-between p-2 rounded-lg bg-surface-overlay">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono text-tactical-400 shrink-0">#{i + 1}</span>
                          <span className="text-xs font-medium text-tactical-900 truncate">{m.name}</span>
                        </div>
                        <span className="text-xs font-bold font-mono text-tactical-900 shrink-0">
                          {m.rawScoreTotal.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  {leftMemberRowsCurrent.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
                      {leftMemberRowsCurrent.map(m => (
                        <div key={m.uid} className="flex items-center justify-between p-2 rounded-lg bg-surface-overlay opacity-60">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-tactical-300 shrink-0">—</span>
                            <span className="text-xs font-medium text-tactical-600 italic truncate">{m.name}</span>
                          </div>
                          <span className="text-xs font-bold font-mono text-tactical-600 shrink-0">
                            {m.rawScoreTotal.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {pastSeasonLeaderboards.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-tactical-500 uppercase tracking-wide">Past Seasons</p>
                  {pastSeasonLeaderboards.map(season => (
                    <details key={season.weekKey} className="group rounded-xl border border-tactical-200 overflow-hidden">
                      <summary className="cursor-pointer select-none list-none px-3 py-2.5 text-sm font-medium text-tactical-900 bg-surface-overlay flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400">▶</span>
                          {season.seasonLabel}
                        </span>
                        <span className="badge badge-inactive capitalize text-xs">
                          {season.mode === 'full' ? 'Detailed' : 'Simple'}
                        </span>
                      </summary>
                      <div className="p-3 border-t border-tactical-100">
                        {season.mode !== 'full' ? (
                          <p className="text-xs text-tactical-500">Simple mode — no numeric scores tracked this week.</p>
                        ) : season.ranked.length === 0 && season.leftRows.length === 0 ? (
                          <p className="text-xs text-tactical-500">No scores recorded.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-tactical-100">
                                  <th className="text-left py-1.5 pr-2 text-tactical-500 font-medium w-8">#</th>
                                  <th className="text-left py-1.5 pr-2 text-tactical-500 font-medium min-w-[100px]">Commander</th>
                                  {DAYS.map((day, i) => (
                                    <th key={day} className="text-center py-1.5 px-1 text-tactical-500 font-medium w-8">D{i + 1}</th>
                                  ))}
                                  <th className="text-center py-1.5 pl-2 text-tactical-500 font-medium w-16">Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {season.ranked.map((m, i) => (
                                  <tr key={m.uid} className="border-b border-tactical-50">
                                    <td className="py-1.5 pr-2 text-tactical-400 font-mono">{i + 1}</td>
                                    <td className="py-1.5 pr-2 font-medium text-tactical-900">{m.name}</td>
                                    {m.dayResults.map((status, di) => (
                                      <td key={di} className="py-1.5 px-1 text-center">
                                        {status === 'passed'        && <span className="text-accent-deep">✓</span>}
                                        {status === 'below_minimum' && <span className="text-amber-500">⚠</span>}
                                        {status === 'absent'        && <span className="text-red-400">✗</span>}
                                        {status === 'pending'       && <span className="text-tactical-300">·</span>}
                                      </td>
                                    ))}
                                    <td className="py-1.5 pl-2 text-center font-bold font-mono text-tactical-900">
                                      {m.score.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                                {season.leftRows.map(m => (
                                  <tr key={m.uid} className="border-b border-tactical-50 opacity-60">
                                    <td className="py-1.5 pr-2 text-tactical-300 font-mono">—</td>
                                    <td className="py-1.5 pr-2 font-medium text-tactical-600 italic">
                                      {m.name} <span className="not-italic text-[10px] text-tactical-400">(left)</span>
                                    </td>
                                    {m.dayResults.map((status, di) => (
                                      <td key={di} className="py-1.5 px-1 text-center">
                                        {status === 'passed'        && <span className="text-accent-deep">✓</span>}
                                        {status === 'below_minimum' && <span className="text-amber-500">⚠</span>}
                                        {status === 'absent'        && <span className="text-red-400">✗</span>}
                                        {status === 'pending'       && <span className="text-tactical-300">·</span>}
                                      </td>
                                    ))}
                                    <td className="py-1.5 pl-2 text-center font-bold font-mono text-tactical-600">
                                      {m.score.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              </div>
            </details>
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

      {/* Score Trend — last 4 recorded Detailed-mode weeks, up/down vs the
          immediately previous week. Collapsed by default. */}
      {isR4Plus && scoreTrendRows.length > 0 && (
        <details className="glass-card p-5 group">
          <summary className="flex items-center justify-between cursor-pointer select-none list-none">
            <p className="font-semibold text-tactical-900 flex items-center gap-2">
              <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400 text-xs">▶</span>
              Score Trend — Last {trendWeeksChrono.length} Weeks
            </p>
            <p className="text-xs text-tactical-500">▲ scoring more · ▼ scoring less than last recorded week</p>
          </summary>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-tactical-100">
                  <th className="text-left py-1.5 pr-2 text-tactical-500 font-medium min-w-[100px]">Commander</th>
                  {trendWeeksChrono.map(w => (
                    <th key={w.weekKey} className="text-center py-1.5 px-2 text-tactical-500 font-medium whitespace-nowrap">
                      {w.seasonLabel}
                    </th>
                  ))}
                  <th className="text-center py-1.5 pl-2 text-tactical-500 font-medium w-10">Trend</th>
                </tr>
              </thead>
              <tbody>
                {scoreTrendRows.map(r => (
                  <tr key={r.uid} className="border-b border-tactical-50">
                    <td className="py-1.5 pr-2 font-medium text-tactical-900">{r.name}</td>
                    {r.scores.map((score, i) => (
                      <td key={i} className="py-1.5 px-2 text-center font-mono text-tactical-700">
                        {score !== null ? score.toLocaleString() : <span className="text-tactical-300">–</span>}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-center">
                      {r.trend === 'up'   && <span className="text-accent-deep font-bold">▲</span>}
                      {r.trend === 'down' && <span className="text-red-500 font-bold">▼</span>}
                      {r.trend === 'flat' && <span className="text-tactical-400">–</span>}
                      {r.trend === null   && <span className="text-tactical-300">·</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Analytics — cumulative absent vs below-minimum history (own row for members, all for leadership) */}
      {analyticsRows.length > 0 && (
        <details className="glass-card p-5 group">
          <summary className="flex items-center justify-between cursor-pointer select-none list-none">
            <p className="font-semibold text-tactical-900 flex items-center gap-2">
              <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400 text-xs">▶</span>
              {isR4Plus ? 'Participation Analytics — All Time' : 'Your Participation History'}
            </p>
            <p className="text-xs text-tactical-500">Absent and Below-Minimum tracked separately, all recorded weeks</p>
          </summary>
          <div className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {analyticsRows.map(r => {
              const level = WARNING_LEVEL(r.total)
              return (
                <div key={r.uid} className={`p-2.5 rounded-xl border ${level.bg} flex flex-col gap-1.5`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-tactical-900 truncate">{r.name}</span>
                    <span className={`text-sm font-bold font-mono shrink-0 ${level.color}`}>{r.total}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-red-500 font-medium">✗ Absent: {r.absent}</span>
                    <span className="text-amber-600 font-medium">⚠ Below Min: {r.belowMin}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-tactical-100 flex-wrap">
            <span className="text-xs text-accent-deep">● 0 Green</span>
            <span className="text-xs text-amber-600">● 1–2 Yellow</span>
            <span className="text-xs text-orange-600">● 3–4 Orange</span>
            <span className="text-xs text-red-600">● 5+ Red</span>
          </div>
          </div>
        </details>
      )}

      {/* Points reference */}
      <details className="glass-card p-5 group">
        <summary className="flex items-center gap-2 cursor-pointer select-none list-none font-semibold text-tactical-900">
          <span className="inline-block transition-transform group-open:rotate-90 text-tactical-400 text-xs">▶</span>
          Weekly Schedule
        </summary>
        <div className="mt-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {DAYS.map((day, i) => (
            <div key={day} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-overlay">
              <p className="text-xs text-tactical-700">Day {i + 1} — {DUEL_DAY_NAMES[day].split('— ')[1]}</p>
              <span className="badge badge-active text-xs font-mono">+{DUEL_POINT_VALUES[day]}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 p-2.5 rounded-xl bg-accent-light border border-accent/20 flex justify-between">
          <span className="text-sm font-semibold text-accent-deep">Points awarded on Victory only</span>
          <span className="text-sm font-bold text-accent-deep font-mono">13 pts max / week</span>
        </div>
        </div>
      </details>
    </div>
  )
}