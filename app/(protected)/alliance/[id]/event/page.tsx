'use client'
// app/(protected)/alliance/[id]/events/page.tsx
// Alliance Event Center — Agenda view. Groups events into Today /
// Tomorrow / This Week / Upcoming / Completed. This is the FIRST real
// calendar view shipped — Month/Week grid views are a later pass; Agenda
// was prioritized because it's the simplest to get correct and is
// genuinely usable on mobile immediately.

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  EVENT_CATEGORY_META, EVENT_PRIORITY_META,
  type CalendarEvent, type AttendanceResponse,
} from '@/lib/events/types'
import { useCountdown, formatCountdown } from '@/hooks/useCountdown'
import EventFormModal from '@/components/events/EventFormModal'

interface EventWithExtras extends CalendarEvent {
  calendar_event_participants: { commander_uid: string; response: AttendanceResponse | null }[]
  calendar_event_reminders: { id: string }[]
}

function EventCard({ event, onChanged, myUid }: { event: EventWithExtras; onChanged: () => void; myUid: string }) {
  const meta = EVENT_CATEGORY_META[event.category]
  const priorityMeta = EVENT_PRIORITY_META[event.priority]
  const eventStart = event.all_day ? null : new Date(`${event.event_date}T${event.start_time ?? '00:00:00'}Z`)
  const countdown = useCountdown(eventStart)
  const myResponse = event.calendar_event_participants.find(p => p.commander_uid === myUid)?.response

  const [busy, setBusy] = useState(false)

  const respond = async (response: AttendanceResponse) => {
    setBusy(true)
    try {
      await fetch(`/api/events/${event.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const togglePin = async () => {
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !event.is_pinned }),
    })
    onChanged()
  }

  const toggleFavorite = async () => {
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !event.is_favorite }),
    })
    onChanged()
  }

  const markComplete = async () => {
    await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_completed: true }),
    })
    onChanged()
  }

  const duplicate = async () => {
    await fetch(`/api/events/${event.id}/duplicate`, { method: 'POST' })
    onChanged()
  }

  const remove = async () => {
    if (!confirm(`Delete "${event.title}"?`)) return
    await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    onChanged()
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span style={{ fontSize: 28, lineHeight: 1 }}>{event.icon || meta.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-tactical-900 truncate">{event.title}</p>
              {event.is_pinned && <span title="Pinned">📌</span>}
              {event.is_favorite && <span title="Favorite">⭐</span>}
            </div>
            <p className="text-xs mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
            {event.description && <p className="text-sm text-tactical-500 mt-1">{event.description}</p>}
          </div>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${priorityMeta.color}1A`, color: priorityMeta.color }}
        >
          {priorityMeta.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-tactical-500 flex-wrap">
        <span>{event.all_day ? 'All day' : `${event.start_time?.slice(0, 5) ?? '--:--'} UTC-2`}</span>
        {event.location && <span>📍 {event.location}</span>}
        {countdown && !countdown.isPast && (
          <span className="font-mono font-semibold text-accent-deep">
            Starts in {formatCountdown(countdown)}
          </span>
        )}
      </div>

      {/* Attendance */}
      {!event.is_completed && (
        <div className="flex gap-1.5 flex-wrap">
          {(['going', 'maybe', 'unavailable', 'late'] as AttendanceResponse[]).map(r => (
            <button
              key={r}
              disabled={busy}
              onClick={() => respond(r)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-colors
                ${myResponse === r
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white text-tactical-600 border-tactical-200 hover:border-tactical-300'}`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-tactical-100 flex-wrap">
        <button onClick={togglePin} className="btn-ghost text-xs">{event.is_pinned ? 'Unpin' : 'Pin'}</button>
        <button onClick={toggleFavorite} className="btn-ghost text-xs">{event.is_favorite ? 'Unfavorite' : 'Favorite'}</button>
        <button onClick={duplicate} className="btn-ghost text-xs">Duplicate</button>
        {!event.is_completed && (
          <button onClick={markComplete} className="btn-ghost text-xs">Mark Complete</button>
        )}
        <button onClick={remove} className="btn-ghost text-xs text-red-500 ml-auto">Delete</button>
      </div>
    </div>
  )
}

export default function EventsAgendaPage() {
  const params = useParams()
  const allianceId = params.id as string

  const [events, setEvents] = useState<EventWithExtras[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [myUid, setMyUid] = useState('')

  const fetchEvents = useCallback(async () => {
    const res = await fetch('/api/events?include_archived=false')
    if (res.ok) {
      const data = await res.json()
      setEvents(data.events ?? [])
      setMyUid(data.viewer_uid ?? '')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)

  const groups: { label: string; items: EventWithExtras[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Tomorrow', items: [] },
    { label: 'This Week', items: [] },
    { label: 'Upcoming', items: [] },
    { label: 'Completed', items: [] },
  ]

  for (const event of events) {
    if (event.is_completed) { groups[4].items.push(event); continue }
    const eventDate = new Date(event.event_date + 'T00:00:00Z')
    if (eventDate.getTime() === today.getTime()) groups[0].items.push(event)
    else if (eventDate.getTime() === tomorrow.getTime()) groups[1].items.push(event)
    else if (eventDate > tomorrow && eventDate <= weekEnd) groups[2].items.push(event)
    else if (eventDate > weekEnd) groups[3].items.push(event)
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Alliance Events</h1>
          <p className="page-subtitle">Agenda view</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Event
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-tactical-500">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-2xl mb-3">🗓️</p>
          <p className="font-semibold text-tactical-900">No events yet</p>
          <p className="text-sm text-tactical-500 mt-1">Create your first alliance event or personal reminder.</p>
        </div>
      ) : (
        groups.filter(g => g.items.length > 0).map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-tactical-500 mb-2">
              {group.label} ({group.items.length})
            </p>
            <div className="flex flex-col gap-3">
              {group.items.map(event => (
                <EventCard key={event.id} event={event} onChanged={fetchEvents} myUid={myUid} />
              ))}
            </div>
          </div>
        ))
      )}

      {showCreate && (
        <EventFormModal
          allianceId={allianceId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchEvents() }}
        />
      )}
    </div>
  )
}