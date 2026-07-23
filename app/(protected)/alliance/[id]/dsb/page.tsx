// app/(protected)/alliance/[id]/dsb/page.tsx
import { headers }           from 'next/headers'
import { redirect }          from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey, getCurrentSeasonLabel } from '@/lib/utils/utc2'
import Link                  from 'next/link'
import type { Role }         from '@/lib/types'

const STATE_LABEL: Record<string, string> = {
  pending:               'Pending',
  registration_open:     'Registration Open',
  registration_closed:   'Registration Closed',
  battle:                'Battle Day',
  complete:              'Complete',
}
const STATE_COLOR: Record<string, string> = {
  pending:               'badge-inactive',
  registration_open:     'badge-active',
  registration_closed:   'badge-warning',
  battle:                'badge-warning',
  complete:              'badge-active',
}
const STATE_STEPS = ['pending','registration_open','registration_closed','battle','complete']

export default async function DSBPage({
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

  const { data: dsbEvent } = await supabase
    .from('dsb_events')
    .select('*')
    .eq('alliance_id', allianceId)
    .eq('week_key', weekKey)
    .single()

  // Get roster counts
  let tfaStarters = 0, tfaSubs = 0, tfbStarters = 0, tfbSubs = 0
  if (dsbEvent) {
    const { data: roster } = await supabase
      .from('event_roster')
      .select('task_force, roster_role')
      .eq('event_id', dsbEvent.id)
      .eq('event_type', 'dsb')

    tfaStarters = (roster ?? []).filter(r => r.task_force === 'A' && r.roster_role === 'starter').length
    tfaSubs     = (roster ?? []).filter(r => r.task_force === 'A' && r.roster_role === 'substitute').length
    tfbStarters = (roster ?? []).filter(r => r.task_force === 'B' && r.roster_role === 'starter').length
    tfbSubs     = (roster ?? []).filter(r => r.task_force === 'B' && r.roster_role === 'substitute').length
  }

  const currentStep = dsbEvent ? STATE_STEPS.indexOf(dsbEvent.state) : 0

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Desert Storm Battlefield</h1>
          <p className="page-subtitle">{getCurrentSeasonLabel()}</p>
        </div>
        {isR4Plus && dsbEvent && (
          <Link href={`/alliance/${allianceId}/dsb/register`} className="btn-primary">
            Manage Rosters
          </Link>
        )}
      </div>

      {/* No event yet */}
      {!dsbEvent && (
        <div className="glass-card p-8 text-center">
          <p className="text-3xl mb-3">◆</p>
          <p className="font-semibold text-tactical-900">No DSB event this week</p>
          <p className="text-sm text-tactical-500 mt-1">
            Events are created automatically every Monday at 00:00 UTC-2.
          </p>
          {isR4Plus && (
            <Link href={`/alliance/${allianceId}/dsb/register`}
                  className="btn-primary mt-4 inline-flex">
              Create Manually
            </Link>
          )}
        </div>
      )}

      {dsbEvent && (
        <>
          {/* State timeline */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-tactical-900">Event Status</p>
              <span className={`badge ${STATE_COLOR[dsbEvent.state]}`}>
                {STATE_LABEL[dsbEvent.state]}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {STATE_STEPS.map((s, i) => (
                <div key={s} className="flex items-center flex-1">
                  {i > 0 && (
                    <div className={`flex-1 h-0.5 ${i <= currentStep ? 'bg-accent' : 'bg-tactical-200'}`} />
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0
                    ${i < currentStep  ? 'bg-accent text-white' : ''}
                    ${i === currentStep ? 'bg-accent-light border-2 border-accent text-accent-deep' : ''}
                    ${i > currentStep  ? 'bg-tactical-100 text-tactical-400' : ''}
                  `}>
                    {i < currentStep ? '✓' : i + 1}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {STATE_STEPS.map(s => (
                <p key={s} className="text-[9px] text-tactical-400 capitalize text-center flex-1">
                  {s.replace('_',' ')}
                </p>
              ))}
            </div>
          </div>

          {/* Schedule reference */}
          <div className="glass-card p-5">
            <p className="font-semibold text-tactical-900 mb-3">Weekly Schedule</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { day: 'Monday',    event: 'Registration Opens' },
                { day: 'Wednesday', event: 'Registration Closes' },
                { day: 'Thursday',  event: 'Matchmaking' },
                { day: 'Friday',    event: 'Battle Day' },
              ].map(item => (
                <div key={item.day} className="flex items-center justify-between p-2 rounded-lg bg-surface-overlay">
                  <span className="font-medium text-tactical-700">{item.day}</span>
                  <span className="text-tactical-500">{item.event}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 rounded-lg bg-surface-overlay">
              <p className="text-xs text-tactical-600 font-medium mb-1">Available Time Slots (UTC-2)</p>
              <div className="flex gap-2">
                {['09:00','18:00','23:00'].map(slot => (
                  <span key={slot} className="badge badge-inactive font-mono">{slot}</span>
                ))}
              </div>
            </div>
          </div>

          {/* TF Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(['A','B'] as const).map(tf => {
              const starters = tf === 'A' ? tfaStarters : tfbStarters
              const subs     = tf === 'A' ? tfaSubs     : tfbSubs
              const slot     = tf === 'A' ? dsbEvent.tfa_slot : dsbEvent.tfb_slot
              const finalized = tf === 'A' ? dsbEvent.tfa_finalized : dsbEvent.tfb_finalized
              return (
                <div key={tf} className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-tactical-900">Task Force {tf}</p>
                    {finalized
                      ? <span className="badge badge-active">Finalized</span>
                      : <span className="badge badge-inactive">Draft</span>
                    }
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-3">
                    <div className="p-2 rounded-lg bg-surface-overlay">
                      <p className="text-xs text-tactical-500">Starters</p>
                      <p className={`font-bold text-sm mt-0.5 ${starters === 20 ? 'text-accent-deep' : 'text-tactical-700'}`}>
                        {starters}/20
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-overlay">
                      <p className="text-xs text-tactical-500">Subs</p>
                      <p className={`font-bold text-sm mt-0.5 ${subs === 10 ? 'text-accent-deep' : 'text-tactical-700'}`}>
                        {subs}/10
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-overlay">
                      <p className="text-xs text-tactical-500">Slot</p>
                      <p className="font-mono font-bold text-sm mt-0.5 text-tactical-700">
                        {slot ?? '—'}
                      </p>
                    </div>
                  </div>
                  {isR4Plus && !finalized && (
                    <Link href={`/alliance/${allianceId}/dsb/register`}
                          className="btn-secondary w-full text-xs">
                      Edit TF-{tf} →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>

          {/* Attendance button */}
          {isR4Plus && (dsbEvent.state === 'battle' || dsbEvent.state === 'complete') && (
            <Link href={`/alliance/${allianceId}/dsb/attendance`} className="btn-primary w-full justify-center">
              Record Attendance →
            </Link>
          )}
        </>
      )}
    </div>
  )
}