'use client'
// components/events/MonthCalendar.tsx
// Month grid view for the Alliance Event Center. Deliberately dumb: it
// only renders and lets you click a day to open the create-event modal
// prefilled with that date, or click an event chip to jump into the
// Agenda view (which still owns all edit/RSVP/delete actions). No
// separate single-event page exists yet, so the grid never tries to be
// the place where you manage an event — just where you spot and add one.

import { useMemo, useState } from 'react'
import { EVENT_CATEGORY_META, type CalendarEvent } from '@/lib/events/types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props<T extends CalendarEvent> {
  events: T[]
  onDayClick: (dateKey: string) => void
  onEventClick?: (event: T) => void
}

export default function MonthCalendar<T extends CalendarEvent>({ events, onDayClick, onEventClick }: Props<T>) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const todayKey = toDateKey(new Date())

  const eventsByDay = useMemo(() => {
    const map = new Map<string, T[]>()
    for (const ev of events) {
      const list = map.get(ev.event_date) ?? []
      list.push(ev)
      map.set(ev.event_date, list)
    }
    return map
  }, [events])

  const cells = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    // Monday-start grid: JS getDay() is 0=Sun..6=Sat, shift so Mon=0..Sun=6
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
    const gridStart = new Date(year, month, 1 - leadingBlanks)

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="btn-ghost text-sm px-3 py-1.5"
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="font-semibold text-tactical-900">{monthLabel}</p>
        <button
          onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="btn-ghost text-sm px-3 py-1.5"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide text-tactical-500 py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const key = toDateKey(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const isToday = key === todayKey
          const dayEvents = eventsByDay.get(key) ?? []
          const visible = dayEvents.slice(0, 3)
          const overflow = dayEvents.length - visible.length

          return (
            <button
              key={i}
              onClick={() => onDayClick(key)}
              className="text-left rounded-xl p-1.5 min-h-[76px] flex flex-col gap-1 border transition-colors"
              style={{
                background: isToday ? 'rgba(34,197,94,0.08)' : inMonth ? '#fff' : 'transparent',
                borderColor: isToday ? 'rgba(34,197,94,0.4)' : inMonth ? '#E2E8F0' : 'transparent',
                opacity: inMonth ? 1 : 0.4,
              }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: isToday ? '#15803D' : '#334155' }}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {visible.map(ev => {
                  const meta = EVENT_CATEGORY_META[ev.category]
                  return (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onEventClick?.(ev) }}
                      className="text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium"
                      style={{ background: `${meta.color}1A`, color: meta.color }}
                      title={ev.title}
                    >
                      {ev.all_day ? '' : ev.start_time ? `${ev.start_time.slice(0, 5)} ` : ''}{ev.title}
                    </div>
                  )
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-tactical-500 px-1">+{overflow} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
