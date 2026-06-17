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

  // ── Build Duel performance data ───────────────
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
    const dsbAttRate = dsbEv
      ? Math.round((dsbAtt.filter(a => a.event_id === dsbEv.id && a.status === 'attended').length /
          Math.max(dsbAtt.filter(a => a.event_id === dsbEv.id).length, 1)) * 100)
      : null
    return {
      week_key: week.week_key,
      duel_passed: passed,
      duel_absent: absent,
      duel_below: below,
      dsb_attendance_rate: dsbAttRate,
    }
  })

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

      {/* DSB Attendance Trend */}
      <AttendanceTrendChart
        dsbData={dsbTrend}
        canyonData={canyonTrend}
      />

      {/* Duel Performance */}
      <DuelPerformanceChart data={duelTrend} />

      {/* Top Contributors + Inactive Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopContributors data={topContributors} />
        <InactiveReport members={inactiveList} allianceId={allianceId} />
      </div>

      {/* Weekly Summary Table */}
      <WeeklySummaryTable data={weeklySummary} />
    </div>
  )
}