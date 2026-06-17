// app/(protected)/alliance/[id]/canyon/attendance/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface RosterMember { commander_uid: string; name: string; task_force: string; roster_role: string }
interface AttendanceRecord { commander_uid: string; status: string }

const STATUSES = ['attended','absent','late','backup','emergency','afk'] as const
const STATUS_COLOR: Record<string, string> = {
  attended: 'chip-participated', absent: 'chip-absent',
  late: 'chip-below', backup: 'chip-unselected',
  emergency: 'chip-unselected', afk: 'chip-below',
}

export default function CanyonAttendancePage() {
  const params     = useParams()
  const router     = useRouter()
  const allianceId = params.id as string

  const [roster,     setRoster]     = useState<RosterMember[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({})
  const [eventId,    setEventId]    = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [msg,        setMsg]        = useState('')
  const [activeTab,  setActiveTab]  = useState<'A'|'B'>('A')

  useEffect(() => { fetchData() }, [allianceId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/canyon/attendance?alliance_id=${allianceId}`)
      const data = await res.json()
      setEventId(data.event_id ?? null)
      setRoster(data.roster ?? [])
      const map: Record<string, AttendanceRecord> = {}
      for (const a of (data.attendance ?? [])) map[a.commander_uid] = a
      setAttendance(map)
    } catch { setMsg('Failed to load') }
    finally   { setLoading(false) }
  }

  const handleRecord = async (commanderUid: string, status: string) => {
    if (!eventId) return
    setSaving(commanderUid); setMsg('')
    try {
      const res = await fetch('/api/canyon/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, commander_uid: commanderUid, status, task_force: activeTab }),
      })
      if (!res.ok) { const d = await res.json(); setMsg(d.error); return }
      setAttendance(prev => ({ ...prev, [commanderUid]: { commander_uid: commanderUid, status } }))
    } catch { setMsg('Failed to record') }
    finally   { setSaving(null) }
  }

  const tfRoster = roster.filter(r => r.task_force === activeTab)
  const starters = tfRoster.filter(r => r.roster_role === 'starter')
  const subs     = tfRoster.filter(r => r.roster_role === 'substitute')

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Canyon Attendance</h1>
          <p className="page-subtitle">Record battle attendance</p>
        </div>
        <button onClick={() => router.back()} className="btn-ghost text-sm">← Back</button>
      </div>

      {msg && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{msg}</div>}

      {!eventId ? (
        <div className="glass-card p-8 text-center">
          <p className="text-tactical-500">No Canyon event found for this week</p>
        </div>
      ) : (
        <>
          <div className="flex gap-1 bg-surface-raised rounded-xl p-1 w-fit">
            {(['A','B'] as const).map(tf => (
              <button key={tf} onClick={() => setActiveTab(tf)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tf ? 'bg-white text-tactical-900 shadow-sm' : 'text-tactical-500'
                }`}>
                TF-{tf}
              </button>
            ))}
          </div>

          <div className="glass-card p-5">
            <p className="font-semibold text-tactical-900 mb-4">Starters — TF-{activeTab}</p>
            <div className="flex flex-col gap-3">
              {starters.map(m => {
                const rec = attendance[m.commander_uid]
                return (
                  <div key={m.commander_uid}
                       className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-overlay">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-accent-light flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-accent-deep">{m.name.charAt(0)}</span>
                      </div>
                      <p className="text-sm font-medium text-tactical-900 truncate">{m.name}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {STATUSES.map(s => (
                        <button key={s} onClick={() => handleRecord(m.commander_uid, s)}
                          disabled={saving === m.commander_uid}
                          className={`chip text-xs ${rec?.status === s ? STATUS_COLOR[s] : 'chip-unselected'}`}>
                          {s === 'attended' ? '✓' : s === 'absent' ? '✗' :
                           s === 'late' ? '⏱' : s === 'afk' ? '💤' :
                           s === 'backup' ? '↑' : '⚡'}
                          <span className="hidden lg:inline ml-1 capitalize">{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {starters.length === 0 && (
                <p className="text-sm text-tactical-400 text-center py-4">No starters in TF-{activeTab}</p>
              )}
            </div>
          </div>

          {subs.length > 0 && (
            <div className="glass-card p-5">
              <p className="font-semibold text-tactical-900 mb-4">Substitutes — TF-{activeTab}</p>
              <div className="flex flex-col gap-3">
                {subs.map(m => {
                  const rec = attendance[m.commander_uid]
                  return (
                    <div key={m.commander_uid}
                         className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-overlay">
                      <p className="text-sm font-medium text-tactical-900 flex-1 truncate">{m.name}</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {STATUSES.map(s => (
                          <button key={s} onClick={() => handleRecord(m.commander_uid, s)}
                            disabled={saving === m.commander_uid}
                            className={`chip text-xs ${rec?.status === s ? STATUS_COLOR[s] : 'chip-unselected'}`}>
                            {s === 'attended' ? '✓' : s === 'absent' ? '✗' : s.slice(0,3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}