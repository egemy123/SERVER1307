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
 * Get 00:00 of the current UTC-2 day, returned as a UTC Date (for Supabase
 * queries). Used for daily quota resets — e.g. "10 alerts per day" resets
 * at midnight UTC-2, not midnight server time.
 */
export function getDayStartUTC2(date: Date = new Date()): Date {
  const u = toUTC2(date)
  const start = new Date(u)
  start.setUTCHours(0, 0, 0, 0)
  return new Date(start.getTime() - UTC2_OFFSET_MS)
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

// ── Season labeling ──────────────────────────────────────────
// "S-34 W4" style: a Season is 4 consecutive Duel weeks. The season
// number increments every 4 weeks; the week-in-season cycles 1-4.
//
// ANCHOR (the one fact this whole scheme is built on): the Duel week
// starting Monday 2026-07-20 (i.e. week_key "2026-W30") is Season 34,
// Week 4. Every other week's season/week is computed from this single
// anchor via calendar-day arithmetic — NOT from ISO week-of-year numbers
// directly, since those reset every January and would break the season
// count across a year boundary.
//
// If this anchor is ever wrong by so much as one week, every season
// label from that point on shifts by the same amount — it was set from
// what was confirmed to be "the current week" in conversation (corrected
// once already — an earlier version of this anchor used 2026-W29, which
// was wrong by exactly one week), not independently re-derived, so please
// double-check S-34 W4 against week_key "2026-W30" specifically before
// relying on this in production.
const SEASON_ANCHOR_MONDAY = Date.UTC(2026, 6, 20) // 2026-07-20, month is 0-indexed
const SEASON_ANCHOR_SEASON = 34
const SEASON_ANCHOR_WEEK_IN_SEASON = 4 // 1-indexed
const WEEKS_PER_SEASON = 4
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/** Floor-division and true modulo that behave correctly for negative inputs
 *  (JS's built-in `%` returns a negative remainder for negative operands,
 *  which would make weeks before the anchor compute wrong). */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}
function trueMod(a: number, b: number): number {
  return ((a % b) + b) % b
}

/**
 * Converts a duel week's week_start (ISO string, always a Monday) into
 * "S-34 W4" display format.
 */
export function getSeasonLabel(weekStartIso: string): string {
  const weekStart = new Date(weekStartIso).getTime()
  const weeksSinceAnchor = Math.round((weekStart - SEASON_ANCHOR_MONDAY) / MS_PER_WEEK)

  // Shift so index 0 = Week 1 of the anchor's season, regardless of which
  // week-in-season the anchor itself happens to be.
  const cumulativeIndex = weeksSinceAnchor + (SEASON_ANCHOR_WEEK_IN_SEASON - 1)

  const season       = SEASON_ANCHOR_SEASON + floorDiv(cumulativeIndex, WEEKS_PER_SEASON)
  const weekInSeason = trueMod(cumulativeIndex, WEEKS_PER_SEASON) + 1

  return `S-${season} W${weekInSeason}`
}

/**
 * Convenience wrapper for anywhere in the app that needs "what season/week
 * is it right now" WITHOUT having an actual duel_weeks row to read
 * week_start from (e.g. the dashboard header, which shows the current
 * calendar week regardless of whether a Duel week has been started yet).
 * Internally just finds the Monday of the given date's week and feeds it
 * through the same getSeasonLabel() anchor math above — never duplicated.
 */
export function getCurrentSeasonLabel(date: Date = new Date()): string {
  return getSeasonLabel(getWeekStart(date).toISOString())
}