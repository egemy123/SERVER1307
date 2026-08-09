// lib/events/types.ts
// Shared types for the Alliance Event Center (calendar, reminders, alarms).

export type EventCategory =
  | 'desert_storm' | 'canyon_storm' | 'duel' | 'winter_storm' | 'zombie_siege'
  | 'marshal_guard' | 'capitol_war' | 'alliance_meeting' | 'alliance_mail' | 'alliance_gift'
  | 'research_finish' | 'construction_finish' | 'training_finish' | 'shield_expiry' | 'custom_reminder'
  | 'custom'

export type EventPriority   = 'low' | 'medium' | 'high'
export type EventVisibility = 'public' | 'alliance' | 'private'
export type AttendanceResponse = 'going' | 'maybe' | 'unavailable' | 'late' | 'completed'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

export interface CalendarEvent {
  id:              string
  alliance_id:     string | null
  created_by:      string
  title:           string
  description:     string | null
  notes:           string | null
  category:        EventCategory
  priority:        EventPriority
  visibility:      EventVisibility
  event_date:      string
  start_time:      string | null
  end_time:        string | null
  all_day:         boolean
  location:        string | null
  color:           string | null
  icon:            string | null
  repeat_rule:     RepeatRule
  repeat_until:    string | null
  is_pinned:       boolean
  is_favorite:     boolean
  is_archived:     boolean
  is_completed:    boolean
  completed_at:    string | null
  source_module:   'duel' | 'dsb' | 'canyon' | null
  source_ref_id:   string | null
  parent_event_id: string | null
  created_at:      string
  updated_at:      string
}

export interface CalendarEventParticipant {
  id:            string
  event_id:      string
  commander_uid: string
  response:      AttendanceResponse | null
  responded_at:  string | null
  created_at:    string
}

export interface CalendarEventReminder {
  id:              string
  event_id:        string
  commander_uid:   string | null
  offset_minutes:  number
  alarm_enabled:   boolean
  alarm_sound:     string
  alarm_volume:    number
  repeat_alarm:    boolean
  notified_at:     string | null
  snoozed_until:   string | null
  dismissed_at:    string | null
  created_at:      string
}

export interface DueReminder extends CalendarEventReminder {
  event: CalendarEvent
}

export const EVENT_CATEGORY_GROUPS = {
  alliance: [
    'desert_storm', 'canyon_storm', 'duel', 'winter_storm', 'zombie_siege',
    'marshal_guard', 'capitol_war', 'alliance_meeting', 'alliance_mail', 'alliance_gift',
  ] as EventCategory[],
  personal: [
    'research_finish', 'construction_finish', 'training_finish', 'shield_expiry', 'custom_reminder',
  ] as EventCategory[],
  custom: ['custom'] as EventCategory[],
}

export const EVENT_CATEGORY_META: Record<EventCategory, { label: string; icon: string; color: string }> = {
  desert_storm:        { label: 'Desert Storm',       icon: '⚔️', color: '#DC2626' },
  canyon_storm:        { label: 'Canyon Storm',       icon: '🏆', color: '#D97706' },
  duel:                 { label: 'Duel',                icon: '⚔️', color: '#7C3AED' },
  winter_storm:         { label: 'Winter Storm',        icon: '🚀', color: '#0EA5E9' },
  zombie_siege:         { label: 'Zombie Siege',        icon: '🧟', color: '#16A34A' },
  marshal_guard:        { label: 'Marshal Guard',       icon: '🛡️', color: '#4B5563' },
  capitol_war:          { label: 'Capitol War',         icon: '🏰', color: '#B91C1C' },
  alliance_meeting:     { label: 'Alliance Meeting',    icon: '📢', color: '#2563EB' },
  alliance_mail:        { label: 'Alliance Mail',       icon: '✉️', color: '#0891B2' },
  alliance_gift:        { label: 'Alliance Gift',       icon: '🎁', color: '#DB2777' },
  research_finish:      { label: 'Research Finish',     icon: '🔬', color: '#15803D' },
  construction_finish:  { label: 'Construction Finish', icon: '🏗️', color: '#CA8A04' },
  training_finish:      { label: 'Training Finish',     icon: '🎖️', color: '#9333EA' },
  shield_expiry:        { label: 'Shield Expiry',       icon: '🛡️', color: '#EA580C' },
  custom_reminder:      { label: 'Personal Reminder',   icon: '🔔', color: '#64748B' },
  custom:               { label: 'Custom Event',        icon: '📌', color: '#22C55E' },
}

export const EVENT_PRIORITY_META: Record<EventPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: '#64748B' },
  medium: { label: 'Medium', color: '#D97706' },
  high:   { label: 'High',   color: '#DC2626' },
}

export const REMINDER_OFFSETS = [
  { minutes: 5,    label: '5 minutes before' },
  { minutes: 10,   label: '10 minutes before' },
  { minutes: 15,   label: '15 minutes before' },
  { minutes: 30,   label: '30 minutes before' },
  { minutes: 60,   label: '1 hour before' },
  { minutes: 120,  label: '2 hours before' },
  { minutes: 360,  label: '6 hours before' },
  { minutes: 720,  label: '12 hours before' },
  { minutes: 1440, label: '1 day before' },
] as const

export const ALARM_SOUNDS = [
  { id: 'default', label: 'Default Chime' },
  { id: 'royal',   label: 'Royal Fanfare' },
  { id: 'urgent',  label: 'Urgent Alert' },
  { id: 'soft',    label: 'Soft Bell' },
] as const