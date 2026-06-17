// app/(protected)/alliance/[id]/page.tsx
import { headers }          from 'next/headers'
import { redirect }         from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekKey }       from '@/lib/utils/utc2'
import Link                 from 'next/link'
import type { Role }        from '@/lib/types'

export default async function AlliancePage({
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

  const [
    { data: alliance },
    { data: members },
    { data: dsbEvent },
    { data: canyonEvent },
  ] = await Promise.all([
    supabase.from('alliances').select('*').eq('id', allianceId).single(),
    supabase.from('commanders').select('uid, name, role, status, inactive_flagged').eq('alliance_id', allianceId).order('role').order('name'),
    supabase.from('dsb_events').select('id, state, tfa_slot, tfb_slot, tfa_finalized, tfb_finalized').eq('alliance_id', allianceId).eq('week_key', weekKey).single(),
    supabase.from('canyon_events').select('id, state, tfa_slot, tfb_slot').eq('alliance_id', allianceId).eq('week_key', weekKey).single(),
  ])

  if (!alliance) redirect('/dashboard')

  const activeCount   = (members ?? []).filter((m: any) => m.status === 'active').length
  const inactiveCount = (members ?? []).filter((m: any) => m.inactive_flagged).length
  const isR4Plus      = ['r4','r5','supreme'].includes(role)

  const STATE_LABEL: Record<string, string> = {
    pending: 'Pending', registration_open: 'Open',
    registration_closed: 'Closed', battle: 'Battle', complete: 'Complete',
  }
  const STATE_COLOR: Record<string, string> = {
    pending: 'badge-inactive', registration_open: 'badge-active',
    registration_closed: 'badge-warning', battle: 'badge-warning', complete: 'badge-active',
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Alliance header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center shrink-0">
            <span className="font-bold text-accent-deep text-lg">[{alliance.tag}]</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-tactical-900">{alliance.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge badge-active">{alliance.status}</span>
              <span className="text-xs text-tactical-500">{weekKey}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <span className="text-xs text-tactical-500">Active Members</span>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">{activeCount}</p>
        </div>
        <div className="stat-card">
          <span className="text-xs text-tactical-500">Total Members</span>
          <p className="text-2xl font-semibold text-tactical-900 mt-1">{(members ?? []).length}</p>
        </div>
        <div className={`stat-card ${inactiveCount > 0 ? 'border border-amber-300 bg-amber-50/40' : ''}`}>
          <span className="text-xs text-tactical-500">Inactive Flags</span>
          <p className={`text-2xl font-semibold mt-1 ${inactiveCount > 0 ? 'text-amber-700' : 'text-tactical-900'}`}>
            {inactiveCount}
          </p>
        </div>
        <div className="stat-card">
          <span className="text-xs text-tactical-500">DSB State</span>
          <p className="text-sm font-semibold text-tactical-900 mt-1 capitalize">
            {dsbEvent?.state ? STATE_LABEL[dsbEvent.state] : '—'}
          </p>
        </div>
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Members',  href: `/alliance/${allianceId}/members`,  icon: '◉', desc: 'View all members' },
          { label: 'Duel',     href: `/alliance/${allianceId}/duel`,     icon: '◎', desc: 'Weekly duel tracking' },
          { label: 'DSB',      href: `/alliance/${allianceId}/dsb`,      icon: '◆', desc: 'Desert Storm Battlefield' },
          { label: 'Canyon',   href: `/alliance/${allianceId}/canyon`,   icon: '◇', desc: 'Canyon Storm' },
        ].map(item => (
          <Link key={item.href} href={item.href}
                className="glass-card p-4 flex flex-col gap-2 hover:shadow-glass-md transition-all duration-150 group">
            <span className="text-2xl text-accent-deep group-hover:scale-110 transition-transform duration-150">
              {item.icon}
            </span>
            <div>
              <p className="font-semibold text-tactical-900 text-sm">{item.label}</p>
              <p className="text-xs text-tactical-500">{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Event status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-tactical-900">DSB — {weekKey}</p>
            <span className={`badge ${dsbEvent?.state ? STATE_COLOR[dsbEvent.state] : 'badge-inactive'}`}>
              {dsbEvent?.state ? STATE_LABEL[dsbEvent.state] : 'No Event'}
            </span>
          </div>
          {dsbEvent && (
            <div className="grid grid-cols-2 gap-2 mb-3 text-center">
              <div className="p-2 rounded-lg bg-surface-overlay">
                <p className="text-xs text-tactical-500">TF-A Slot</p>
                <p className="font-mono text-sm font-medium">{dsbEvent.tfa_slot ?? '—'}</p>
              </div>
              <div className="p-2 rounded-lg bg-surface-overlay">
                <p className="text-xs text-tactical-500">TF-B Slot</p>
                <p className="font-mono text-sm font-medium">{dsbEvent.tfb_slot ?? '—'}</p>
              </div>
            </div>
          )}
          {isR4Plus && (
            <Link href={`/alliance/${allianceId}/dsb`} className="btn-primary w-full text-sm">
              Manage DSB →
            </Link>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-tactical-900">Canyon — {weekKey}</p>
            <span className={`badge ${canyonEvent?.state ? STATE_COLOR[canyonEvent.state] : 'badge-inactive'}`}>
              {canyonEvent?.state ? STATE_LABEL[canyonEvent.state] : 'No Event'}
            </span>
          </div>
          {canyonEvent && (
            <div className="grid grid-cols-2 gap-2 mb-3 text-center">
              <div className="p-2 rounded-lg bg-surface-overlay">
                <p className="text-xs text-tactical-500">TF-A Slot</p>
                <p className="font-mono text-sm font-medium">{canyonEvent.tfa_slot ?? '—'}</p>
              </div>
              <div className="p-2 rounded-lg bg-surface-overlay">
                <p className="text-xs text-tactical-500">TF-B Slot</p>
                <p className="font-mono text-sm font-medium">{canyonEvent.tfb_slot ?? '—'}</p>
              </div>
            </div>
          )}
          {isR4Plus && (
            <Link href={`/alliance/${allianceId}/canyon`} className="btn-primary w-full text-sm">
              Manage Canyon →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}