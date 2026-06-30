// app/(supreme)/supreme-dashboard/page.tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey }        from '@/lib/utils/utc2'

export default async function SupremeDashboardPage() {
  const supabase = createAdminClient()
  const weekKey  = getWeekKey()

  const [
    { data: alliances },
    { data: commanders },
    { data: dsbEvents },
    { data: canyonEvents },
  ] = await Promise.all([
    supabase.from('alliances').select('id, tag, name, status'),
    supabase.from('commanders').select('uid, name, role, status, alliance_id, verification_status'),
    supabase.from('dsb_events').select('alliance_id, state').eq('week_key', weekKey),
    supabase.from('canyon_events').select('alliance_id, state').eq('week_key', weekKey),
  ])

  const allianceList    = alliances    ?? []
  const commanderList   = commanders   ?? []
  const dsbList         = dsbEvents    ?? []
  const canyonList      = canyonEvents ?? []

  const totalAlliances  = allianceList.length
  const activeAlliances = allianceList.filter(a => a.status === 'active').length
  const totalCommanders = commanderList.length
  const linkedCount     = commanderList.filter(c => c.verification_status === 'linked').length

  // Per-alliance stats
  const allianceStats = allianceList.map(alliance => {
    const members       = commanderList.filter(c => c.alliance_id === alliance.id)
    const activeCount   = members.filter(m => m.status === 'active').length
    const linkedMembers = members.filter(m => m.verification_status === 'linked').length
    const dsbEvent      = dsbList.find(e => e.alliance_id === alliance.id)
    const canyonEvent   = canyonList.find(e => e.alliance_id === alliance.id)
    return {
      ...alliance,
      totalMembers:  members.length,
      activeMembers: activeCount,
      linkedMembers,
      dsbState:      dsbEvent?.state    ?? null,
      canyonState:   canyonEvent?.state ?? null,
    }
  })

  const STATE_COLOR: Record<string, string> = {
    pending:              'badge-inactive',
    registration_open:    'badge-active',
    registration_closed:  'badge-warning',
    battle:               'badge-warning',
    complete:             'badge-active',
  }
  const STATE_LABEL: Record<string, string> = {
    pending:              'Pending',
    registration_open:    'Open',
    registration_closed:  'Closed',
    battle:               'Battle',
    complete:             'Complete',
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">

      {/* Header */}
      <div className="glass-card p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">👑</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-tactical-900 truncate">Supreme Dashboard</h1>
          <p className="text-[11px] text-tactical-500 font-mono">Week: {weekKey}</p>
        </div>
      </div>

      {/* Global stats — single compact strip, not 4 tall blocks */}
      <div className="glass-card p-3 grid grid-cols-4 divide-x divide-tactical-100">
        <div className="px-2 text-center">
          <p className="text-base font-semibold text-tactical-900 leading-tight">{totalAlliances}</p>
          <p className="text-[10px] text-tactical-500 leading-tight">Alliances</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-base font-semibold text-tactical-900 leading-tight">{totalCommanders}</p>
          <p className="text-[10px] text-tactical-500 leading-tight">Commanders</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-base font-semibold text-tactical-900 leading-tight">{linkedCount}</p>
          <p className="text-[10px] text-tactical-500 leading-tight">Linked</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-base font-semibold text-tactical-900 leading-tight">
            {dsbList.length + canyonList.length}
          </p>
          <p className="text-[10px] text-tactical-500 leading-tight">Events</p>
        </div>
      </div>

      {/* Per-alliance overview — condensed single-row cards */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-tactical-700 px-1">Alliance Overview</p>

        {allianceStats.length === 0 && (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-tactical-400">No alliances found.</p>
          </div>
        )}

        {allianceStats.map(a => (
          <div key={a.id} className="glass-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-accent-deep text-xs shrink-0">[{a.tag}]</span>
                <span className="text-sm font-medium text-tactical-900 truncate">{a.name}</span>
              </div>
              <span className={`badge shrink-0 ${a.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                {a.status}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-tactical-500 flex-wrap">
              <span>👥 {a.totalMembers}/100</span>
              <span>🟢 {a.activeMembers} active</span>
              <span>🔗 {a.linkedMembers} linked</span>
              <span className={`badge ${a.dsbState ? STATE_COLOR[a.dsbState] : 'badge-inactive'}`}>
                DSB: {a.dsbState ? STATE_LABEL[a.dsbState] : 'None'}
              </span>
              <span className={`badge ${a.canyonState ? STATE_COLOR[a.canyonState] : 'badge-inactive'}`}>
                Canyon: {a.canyonState ? STATE_LABEL[a.canyonState] : 'None'}
              </span>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}