// lib/utils/utc2.ts
// All UTC-2 time utilities
// UTC-2 is a fixed offset. No DST ever.
// Store UTC in Supabase. Apply -2h offset only for display and business logic.

const UTC2_OFFSET_MS = -2 * 60 * 60 * 1000 // -7200000ms

/** Convert UTC Date to UTC-2 Date */
export function toUTC2(date: Date = new Date()): Date {
  return new Date(date.getTime() + UTC2_OFFSET_MS)
}

/** Get current time as UTC-2 Date */
export function nowUTC2(): Date {
  return toUTC2(new Date())
}

/** Format a date for display in UTC-2 */
export function formatUTC2(
  date: Date | string,
  opts: { includeTime?: boolean; includeDate?: boolean; short?: boolean } = {}
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const u = toUTC2(d)
  const { includeTime = true, includeDate = true, short = false } = opts
  const parts: string[] = []

  if (includeDate) {
    parts.push(u.toLocaleDateString('en-GB', {
      day: '2-digit', month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC',
    }))
  }
  if (includeTime) {
    const t = u.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    parts.push(`${t} UTC-2`)
  }
  return parts.join(' — ')
}

/** Format time only HH:MM in UTC-2 */
export function formatTimeUTC2(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return toUTC2(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

/**
 * Get ISO week key in UTC-2 context → "2025-W22"
 * CRITICAL: always compute from UTC-2 date, NOT raw UTC
 */
export function getWeekKey(date: Date = new Date()): string {
  const u = toUTC2(date)
  const thursday = new Date(u)
  thursday.setUTCDate(u.getUTCDate() + 3 - ((u.getUTCDay() + 6) % 7))
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Get Monday 00:00 of the current UTC-2 week, returned as UTC Date (for Supabase)
 */
export function getWeekStart(date: Date = new Date()): Date {
  const u = toUTC2(date)
  const day = u.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(u)
  monday.setUTCDate(u.getUTCDate() + diff)
  monday.setUTCHours(0, 0, 0, 0)
  // Convert back to UTC for storage
  return new Date(monday.getTime() - UTC2_OFFSET_MS)
}

/** Get current day name in UTC-2 */
export function getCurrentDayUTC2(): string {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  return days[toUTC2(new Date()).getUTCDay()]
}

/** Human-readable relative time */
export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = d.getTime() - Date.now()
  const mins  = Math.round(diff / 60000)
  const hours = Math.round(diff / 3600000)
  const days  = Math.round(diff / 86400000)
  if (Math.abs(mins)  <  1) return 'just now'
  if (Math.abs(mins)  < 60) return mins  > 0 ? `in ${mins}m`    : `${Math.abs(mins)}m ago`
  if (Math.abs(hours) < 24) return hours > 0 ? `in ${hours}h`   : `${Math.abs(hours)}h ago`
  return days > 0 ? `in ${days}d` : `${Math.abs(days)}d ago`
}

/** Get display values for the live UTC-2 clock */
export function getClockDisplay(date: Date = new Date()): {
  time: string; seconds: string; date: string; day: string
} {
  const u = toUTC2(date)
  return {
    time:    u.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
    seconds: String(u.getUTCSeconds()).padStart(2, '0'),
    date:    u.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }),
    day:     u.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
  }
}

/** Check if two dates are in the same UTC-2 week */
export function isSameWeekUTC2(a: Date, b: Date): boolean {
  return getWeekKey(a) === getWeekKey(b)
}