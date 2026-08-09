'use client'
// components/events/EventFormModal.tsx
// Create-event form. Covers the core fields (title, category, priority,
// date/time, visibility, reminders, alarm) — richer fields from the
// original spec (attachments, custom color/icon picker, full RRULE
// builder) are deferred to a later pass, same as the calendar grid views.

import { useState } from 'react'
import {
  EVENT_CATEGORY_GROUPS, EVENT_CATEGORY_META, EVENT_PRIORITY_META,
  REMINDER_OFFSETS, type EventCategory, type EventPriority, type EventVisibility,
} from '@/lib/events/types'

interface Props {
  allianceId: string
  onClose: () => void
  onCreated: () => void
  initialDate?: string
}

export default function EventFormModal({ allianceId, onClose, onCreated, initialDate }: Props) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState<EventCategory>('custom')
  const [priority, setPriority]     = useState<EventPriority>('medium')
  const [visibility, setVisibility] = useState<EventVisibility>('alliance')
  const [eventDate, setEventDate]   = useState(initialDate ?? '')
  const [allDay, setAllDay]         = useState(false)
  const [startTime, setStartTime]   = useState('')
  const [endTime, setEndTime]       = useState('')
  const [location, setLocation]     = useState('')
  const [reminders, setReminders]   = useState<number[]>([30])
  const [alarmEnabled, setAlarmEnabled] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const toggleReminder = (minutes: number) => {
    setReminders(prev => prev.includes(minutes) ? prev.filter(m => m !== minutes) : [...prev, minutes])
  }

  const submit = async () => {
    if (!title.trim() || !eventDate) {
      setError('Title and date are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          priority,
          visibility,
          event_date: eventDate,
          all_day: allDay,
          start_time: allDay ? undefined : (startTime || undefined),
          end_time: allDay ? undefined : (endTime || undefined),
          location: location.trim() || undefined,
          reminder_offsets: reminders,
          alarm_enabled: alarmEnabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to create event')
        return
      }
      onCreated()
    } catch {
      setError('Failed to create event — check your connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="glass-card-raised w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-tactical-900">New Event</p>
          <button onClick={onClose} className="text-tactical-400 hover:text-tactical-700 text-xl leading-none">×</button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4">{error}</div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Desert Storm" className="input-base" />
          </div>

          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1.5">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="input-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as EventCategory)} className="input-base">
                <optgroup label="Alliance Events">
                  {EVENT_CATEGORY_GROUPS.alliance.map(c => (
                    <option key={c} value={c}>{EVENT_CATEGORY_META[c].icon} {EVENT_CATEGORY_META[c].label}</option>
                  ))}
                </optgroup>
                <optgroup label="Personal Events">
                  {EVENT_CATEGORY_GROUPS.personal.map(c => (
                    <option key={c} value={c}>{EVENT_CATEGORY_META[c].icon} {EVENT_CATEGORY_META[c].label}</option>
                  ))}
                </optgroup>
                <optgroup label="Custom">
                  <option value="custom">📌 Custom Event</option>
                </optgroup>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as EventPriority)} className="input-base">
                {(Object.keys(EVENT_PRIORITY_META) as EventPriority[]).map(p => (
                  <option key={p} value={p}>{EVENT_PRIORITY_META[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1.5">Visibility</label>
            <select value={visibility} onChange={e => setVisibility(e.target.value as EventVisibility)} className="input-base">
              <option value="alliance">Alliance (visible to your alliance, R4+ only can create)</option>
              <option value="private">Private (only visible to you)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-tactical-600 block mb-1.5">Date</label>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="input-base" />
            </div>
            <div className="flex items-end pb-2.5">
              <label className="flex items-center gap-2 text-sm text-tactical-700">
                <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
                All day
              </label>
            </div>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-tactical-600 block mb-1.5">Start Time (UTC-2)</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="text-xs font-medium text-tactical-600 block mb-1.5">End Time (optional)</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-base" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1.5">Location (optional)</label>
            <input value={location} onChange={e => setLocation(e.target.value)} className="input-base" />
          </div>

          <div>
            <label className="text-xs font-medium text-tactical-600 block mb-1.5">Reminders</label>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_OFFSETS.map(o => (
                <button
                  key={o.minutes}
                  type="button"
                  onClick={() => toggleReminder(o.minutes)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors
                    ${reminders.includes(o.minutes)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-white text-tactical-600 border-tactical-200 hover:border-tactical-300'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-tactical-700 mt-2">
              <input type="checkbox" checked={alarmEnabled} onChange={e => setAlarmEnabled(e.target.checked)} />
              Fullscreen alarm popup (not just a notification)
            </label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  )
}