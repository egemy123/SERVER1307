'use client'
// components/dashboard/CommanderCompare.tsx
//
// Phone-spec-sheet style comparison: pick up to 4 alliance members, see their
// Duel/DSB/Canyon/inactivity stats side by side. All stats are computed
// server-side in analytics/page.tsx (last 4 weeks) — this component only
// handles selection + rendering, same split as TopContributors/WeeklySummaryTable.

import { useState, useMemo } from 'react'

export interface CompareMember {
  uid:    string
  name:   string
  role:   string
  status: string
}

export interface CompareStats {
  duelParticipationPct: number | null
  duelAvgScore:         number | null
  dsbPct:               number | null
  canyonPct:            number | null
  inactiveFlagged:      boolean
  inactiveSince:        string | null
}

interface Props {
  members: CompareMember[]
  stats:   Record<string, CompareStats>
}

const MAX_SLOTS = 4

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

function pctColor(v: number | null): string {
  if (v === null) return '#94A3B8'
  if (v >= 75) return '#15803D'
  if (v >= 40) return '#B45309'
  return '#B91C1C'
}

function fmtDaysSince(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days === 0 ? 'Today' : `${days}d ago`
}

export default function CommanderCompare({ members, stats }: Props) {
  const [selected, setSelected] = useState<(string | null)[]>([null, null, null, null])
  const [query, setQuery] = useState<Record<number, string>>({})

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  )

  const filteredOptions = (slot: number) => {
    const q = (query[slot] ?? '').trim().toLowerCase()
    const taken = new Set(selected.filter((v): v is string => v !== null))
    return sortedMembers
      .filter(m => !taken.has(m.uid) || selected[slot] === m.uid)
      .filter(m => q.length === 0 || m.name.toLowerCase().includes(q) || m.uid.includes(q))
      .slice(0, 20)
  }

  const pick = (slot: number, uid: string | null) => {
    setSelected(prev => {
      const next = [...prev]
      next[slot] = uid
      return next
    })
  }

  const activeSlots = selected.map((uid, i) => ({ uid, i })).filter(s => s.uid !== null)

  const rows: { label: string; render: (s: CompareStats) => React.ReactNode }[] = [
    {
      label: 'Duel Participation (last 4 wks)',
      render: s => <span style={{ color: pctColor(s.duelParticipationPct), fontWeight: 700 }}>{fmtPct(s.duelParticipationPct)}</span>,
    },
    {
      label: 'Duel Avg Score',
      render: s => <span style={{ fontFamily: 'monospace' }}>{s.duelAvgScore !== null ? s.duelAvgScore.toLocaleString() : '—'}</span>,
    },
    {
      label: 'DSB Attendance (last 4 wks)',
      render: s => <span style={{ color: pctColor(s.dsbPct), fontWeight: 700 }}>{fmtPct(s.dsbPct)}</span>,
    },
    {
      label: 'Canyon Attendance (last 4 wks)',
      render: s => <span style={{ color: pctColor(s.canyonPct), fontWeight: 700 }}>{fmtPct(s.canyonPct)}</span>,
    },
    {
      label: 'Currently Flagged Inactive',
      render: s => s.inactiveFlagged
        ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>⚠ Yes · {fmtDaysSince(s.inactiveSince)}</span>
        : <span style={{ color: '#15803D' }}>No</span>,
    },
  ]

  return (
    <div className="glass-card p-5">
      <p style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>
        Compare Commanders
      </p>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
        Pick up to {MAX_SLOTS} members to compare side by side. Duel/DSB/Canyon stats cover the last 4 tracked weeks.
        Inactivity reflects current status only — there's no historical log of past flags yet.
      </p>

      {/* Picker slots */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[0, 1, 2, 3].map(slot => {
          const uid = selected[slot]
          const member = uid ? members.find(m => m.uid === uid) ?? null : null
          return (
            <div key={slot} className="relative">
              {member ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-accent-light border border-accent/30">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-tactical-900 truncate">{member.name}</p>
                    <p className="text-xs text-tactical-500 font-mono truncate">{member.role.toUpperCase()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => pick(slot, null)}
                    className="text-tactical-400 hover:text-tactical-600 text-sm shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    className="input-base"
                    placeholder={`Slot ${slot + 1} — search member...`}
                    value={query[slot] ?? ''}
                    onChange={e => setQuery(prev => ({ ...prev, [slot]: e.target.value }))}
                  />
                  {(query[slot] ?? '').trim().length > 0 && (
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-tactical-100 bg-white shadow-lg">
                      {filteredOptions(slot).length === 0 ? (
                        <div className="p-3 text-center text-sm text-tactical-400">No matches</div>
                      ) : (
                        <div className="divide-y divide-tactical-100">
                          {filteredOptions(slot).map(m => (
                            <button
                              key={m.uid}
                              type="button"
                              onClick={() => { pick(slot, m.uid); setQuery(prev => ({ ...prev, [slot]: '' })) }}
                              className="w-full text-left p-2.5 hover:bg-surface-overlay transition-colors"
                            >
                              <p className="text-sm font-medium text-tactical-900 truncate">{m.name}</p>
                              <p className="text-xs text-tactical-500 font-mono">{m.role.toUpperCase()}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Spec sheet */}
      {activeSlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: 14 }}>
          Select at least one member above to see their stats.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 text-xs font-semibold text-tactical-500 uppercase" style={{ width: 200 }}>
                  Metric
                </th>
                {activeSlots.map(({ uid }) => {
                  const m = members.find(mm => mm.uid === uid)!
                  return (
                    <th key={uid} className="text-left p-2 text-sm font-semibold text-tactical-900">
                      {m.name}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label} className="border-t border-tactical-100">
                  <td className="p-2 text-xs text-tactical-500">{row.label}</td>
                  {activeSlots.map(({ uid }) => {
                    const s = stats[uid!] ?? {
                      duelParticipationPct: null, duelAvgScore: null,
                      dsbPct: null, canyonPct: null,
                      inactiveFlagged: false, inactiveSince: null,
                    }
                    return (
                      <td key={uid} className="p-2 text-sm">
                        {row.render(s)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}