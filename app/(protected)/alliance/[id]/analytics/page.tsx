// app/(protected)/alliance/[id]/analytics/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey }        from '@/lib/utils/utc2'
import type { Role }         from '@/lib/types'
import AttendanceTrendChart  from '@/components/dashboard/AttendanceTrendChart'
import DuelPerformanceChart  from '@/components/dashboard/DuelPerformanceChart'
import InactiveReport        from '@/components/dashboard/InactiveReport'
import WeeklySummaryTable    from '@/components/dashboard/WeeklySummaryTable'
import TopContributors       from '@/components/dashboard/TopContributors'
import CommanderCompare      from '@/components/dashboard/CommanderCompare'

export default async function AnalyticsPage({
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

  // Fetch all analytics data in parallel
  const [
    { data: alliance },
    { data: members },
    { data: duelWeeks },
    { data: duelEntries },
    { data: dsbEvents },
    { data: dsbAttendance },
    { data: canyonEvents },
    { data: canyonAttendance },
    { data: inactiveMembers },
  ] = await Promise.all([
    supabase.from('alliances').select('tag, name').eq('id', allianceId).single(),

    supabase.from('commanders')
      .select('uid, name, role, status, inactive_flagged, inactive_flagged_at')
      .eq('alliance_id', allianceId)
      .order('name'),

    supabase.from('duel_weeks')
      .select('id, week_key, mode, minimum_score, created_at')
      .eq('alliance_id', allianceId)
      .order('week_key', { ascending: false })
      .limit(8),

    supabase.from('duel_entries')
      .select('duel_week_id, commander_uid, day, status, score')
      .in('duel_week_id',
        (await supabase.from('duel_weeks').select('id').eq('alliance_id', allianceId).limit(8)).data?.map(w => w.id) ?? []
      ),

    supabase.from('dsb_events')
      .select('id, week_key, state')
      .eq('alliance_id', allianceId)
      .order('week_key', { ascending: false })
      .limit(8),

    supabase.from('attendance_records')
      .select('event_id, commander_uid, status')
      .eq('event_type', 'dsb')
      .in('event_id',
        (await supabase.from('dsb_events').select('id').eq('alliance_id', allianceId).limit(8)).data?.map(e => e.id) ?? []
      ),

    supabase.from('canyon_events')
      .select('id, week_key, state')
      .eq('alliance_id', allianceId)
      .order('week_key', { ascending: false })
      .limit(8),

    supabase.from('attendance_records')
      .select('event_id, commander_uid, status')
      .eq('event_type', 'canyon')
      .in('event_id',
        (await supabase.from('canyon_events').select('id').eq('alliance_id', allianceId).limit(8)).data?.map(e => e.id) ?? []
      ),

    supabase.from('commanders')
      .select('uid, name, inactive_flagged_at, role')
      .eq('alliance_id', allianceId)
      .eq('inactive_flagged', true)
      .order('inactive_flagged_at', { ascending: false }),
  ])

  const memberList  = members ?? []
  const weekList    = duelWeeks ?? []
  const entryList   = duelEntries ?? []
  const dsbList     = dsbEvents ?? []
  const dsbAtt      = dsbAttendance ?? []
  const canyonList  = canyonEvents ?? []
  const canyonAtt   = canyonAttendance ?? []
  const inactiveList = inactiveMembers ?? []

  // ── Build DSB attendance trend data ──────────
  const dsbTrend = dsbList.map(event => {
    const eventAtt  = dsbAtt.filter(a => a.event_id === event.id)
    const total     = eventAtt.length
    const attended  = eventAtt.filter(a => a.status === 'attended').length
    const rate      = total > 0 ? Math.round((attended / total) * 100) : 0
    return { week: event.week_key.replace('20',''), attended, total, rate }
  }).reverse()

  // ── Build Canyon attendance trend data ───────
  const canyonTrend = canyonList.map(event => {
    const eventAtt = canyonAtt.filter(a => a.event_id === event.id)
    const total    = eventAtt.length
    const attended = eventAtt.filter(a => a.status === 'attended').length
    const rate     = total > 0 ? Math.round((attended / total) * 100) : 0
    return { week: event.week_key.replace('20',''), attended, total, rate }
  }).reverse()

  // ── Build Duel performance data (pass/below/absent breakdown) ──
  const duelTrend = weekList.map(week => {
    const weekEntries = entryList.filter(e => e.duel_week_id === week.id)
    const total   = weekEntries.length
    const passed  = weekEntries.filter(e => e.status === 'passed').length
    const absent  = weekEntries.filter(e => e.status === 'absent').length
    const below   = weekEntries.filter(e => e.status === 'below_minimum').length
    const rate    = total > 0 ? Math.round((passed / total) * 100) : 0
    return {
      week: week.week_key.replace('20',''),
      passed, absent, below, total, rate,
    }
  }).reverse()

  // ── Build Duel ATTENDANCE trend — same "attended" framing as DSB/Canyon.
  // Here "attended" means the commander actually played that week (status
  // is passed or below_minimum), regardless of whether they hit minimum —
  // absent is the only thing that counts as a non-attendance, matching how
  // DSB/Canyon attendance is defined.
  const duelAttendanceTrend = weekList.map(week => {
    const weekEntries = entryList.filter(e => e.duel_week_id === week.id)
    const total    = weekEntries.length
    const attended = weekEntries.filter(e => e.status === 'passed' || e.status === 'below_minimum').length
    const rate     = total > 0 ? Math.round((attended / total) * 100) : 0
    return { week: week.week_key.replace('20',''), attended, total, rate }
  }).reverse()

  // ── Top contributors (full mode only) ────────
  const scoreMap: Record<string, number> = {}
  for (const entry of entryList) {
    if (entry.score && entry.score > 0) {
      scoreMap[entry.commander_uid] = (scoreMap[entry.commander_uid] ?? 0) + entry.score
    }
  }
  const topContributors = Object.entries(scoreMap)
    .map(([uid, total]) => ({
      uid,
      name: memberList.find(m => m.uid === uid)?.name ?? uid,
      total,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // ── Weekly summary ────────────────────────────
  const weeklySummary = weekList.map(week => {
    const weekEntries = entryList.filter(e => e.duel_week_id === week.id)
    const passed = weekEntries.filter(e => e.status === 'passed').length
    const absent = weekEntries.filter(e => e.status === 'absent').length
    const below  = weekEntries.filter(e => e.status === 'below_minimum').length

    const dsbEv  = dsbList.find(d => d.week_key === week.week_key)
    const dsbAttendanceRate = dsbEv
      ? Math.round((dsbAtt.filter(a => a.event_id === dsbEv.id && a.status === 'attended').length /
          Math.max(dsbAtt.filter(a => a.event_id === dsbEv.id).length, 1)) * 100)
      : null

    const canyonEv = canyonList.find(c => c.week_key === week.week_key)
    const canyonAttendanceRate = canyonEv
      ? Math.round((canyonAtt.filter(a => a.event_id === canyonEv.id && a.status === 'attended').length /
          Math.max(canyonAtt.filter(a => a.event_id === canyonEv.id).length, 1)) * 100)
      : null

    const duelTotal    = weekEntries.length
    const duelAttended = weekEntries.filter(e => e.status === 'passed' || e.status === 'below_minimum').length
    const duelAttendanceRate = duelTotal > 0 ? Math.round((duelAttended / duelTotal) * 100) : null

    return {
      week_key: week.week_key,
      duel_passed: passed,
      duel_absent: absent,
      duel_below: below,
      dsb_attendance_rate:    dsbAttendanceRate,
      canyon_attendance_rate: canyonAttendanceRate,
      duel_attendance_rate:   duelAttendanceRate,
    }
  })

  // ── Commander comparison (spec-sheet) — last 4 tracked weeks only ────────
  // weekList/dsbList/canyonList are already ordered newest-first, limit 8 —
  // just take the first 4 instead of a separate query.
  const last4Weeks    = weekList.slice(0, 4)
  const last4WeekIds  = new Set(last4Weeks.map(w => w.id))
  const last4Entries  = entryList.filter(e => last4WeekIds.has(e.duel_week_id))

  const last4Dsb    = dsbList.slice(0, 4)
  const last4DsbIds = new Set(last4Dsb.map(e => e.id))
  const last4DsbAtt = dsbAtt.filter(a => last4DsbIds.has(a.event_id))

  const last4Canyon    = canyonList.slice(0, 4)
  const last4CanyonIds = new Set(last4Canyon.map(e => e.id))
  const last4CanyonAtt = canyonAtt.filter(a => last4CanyonIds.has(a.event_id))

  const comparisonStats: Record<string, {
    duelParticipationPct: number | null
    duelAvgScore:         number | null
    dsbPct:               number | null
    canyonPct:            number | null
    inactiveFlagged:      boolean
    inactiveSince:        string | null
  }> = {}

  for (const m of memberList) {
    const entries   = last4Entries.filter(e => e.commander_uid === m.uid)
    // "skipped" (excused) is excluded from the denominator entirely — it's
    // neither a positive nor negative signal, matching how excused absences
    // are treated everywhere else in this codebase.
    const eligible  = entries.filter(e => e.status !== 'skipped')
    const submitted = entries.filter(e => e.status === 'passed' || e.status === 'below_minimum')
    const duelParticipationPct = eligible.length > 0
      ? Math.round((submitted.length / eligible.length) * 100)
      : null

    const scores = submitted
      .map(e => e.score)
      .filter((s): s is number => typeof s === 'number' && s > 0)
    const duelAvgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null

    // DSB/Canyon credit: attended = full, late = half, everything else = 0.
    const dsbRecords = last4DsbAtt.filter(a => a.commander_uid === m.uid)
    const dsbCredit  = dsbRecords.reduce((sum, a) =>
      sum + (a.status === 'attended' ? 1 : a.status === 'late' ? 0.5 : 0), 0)
    const dsbPct = dsbRecords.length > 0
      ? Math.round((dsbCredit / dsbRecords.length) * 100)
      : null

    const canyonRecords = last4CanyonAtt.filter(a => a.commander_uid === m.uid)
    const canyonCredit  = canyonRecords.reduce((sum, a) =>
      sum + (a.status === 'attended' ? 1 : a.status === 'late' ? 0.5 : 0), 0)
    const canyonPct = canyonRecords.length > 0
      ? Math.round((canyonCredit / canyonRecords.length) * 100)
      : null

    comparisonStats[m.uid] = {
      duelParticipationPct,
      duelAvgScore,
      dsbPct,
      canyonPct,
      inactiveFlagged: m.inactive_flagged ?? false,
      inactiveSince:   m.inactive_flagged_at ?? null,
    }
  }


  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      <div className="page-header">
        <h1 className="page-title">[{alliance?.tag}] Analytics</h1>
        <p className="page-subtitle">
          {memberList.length} members · Last 8 weeks · Current: {weekKey}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Total Members</span>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
            {memberList.filter(m => m.status === 'active').length}
          </p>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Inactive Flags</span>
          <p style={{ fontSize: 28, fontWeight: 700, color: inactiveList.length > 0 ? '#B45309' : '#0F172A', marginTop: 4 }}>
            {inactiveList.length}
          </p>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Weeks Tracked</span>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
            {weekList.length}
          </p>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>Avg DSB Rate</span>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#15803D', marginTop: 4 }}>
            {dsbTrend.length > 0
              ? Math.round(dsbTrend.reduce((s, d) => s + d.rate, 0) / dsbTrend.length) + '%'
              : '—'}
          </p>
        </div>
      </div>

      {/* DSB / Canyon / Duel Attendance Trend */}
      <AttendanceTrendChart
        dsbData={dsbTrend}
        canyonData={canyonTrend}
        duelData={duelAttendanceTrend}
      />

      {/* Duel Performance */}
      <DuelPerformanceChart data={duelTrend} />

      {/* Top Contributors + Inactive Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopContributors data={topContributors} />
        <InactiveReport members={inactiveList} allianceId={allianceId} />
      </div>

      {/* Commander Comparison — spec-sheet style, last 4 weeks */}
      <CommanderCompare
        members={memberList.map(m => ({ uid: m.uid, name: m.name, role: m.role, status: m.status }))}
        stats={comparisonStats}
      />

      {/* Weekly Summary Table */}
      <WeeklySummaryTable data={weeklySummary} />
    </div>
  )
}