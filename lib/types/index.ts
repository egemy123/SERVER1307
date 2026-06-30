// lib/types/index.ts
// All TypeScript interfaces for ACC Platform

// ─── ROLES ───────────────────────────────────
export type Role = 'supreme' | 'r5' | 'r4' | 'r3' | 'r2' | 'r1'

// ─── COMMANDER ───────────────────────────────
export type CommanderStatus = 'active' | 'inactive' | 'disabled' | 'former' | 'unassigned'
export type VerificationStatus = 'pending' | 'code_sent' | 'verified' | 'linked'

export interface Commander {
  uid: string
  name: string
  alliance_id: string | null
  role: Role
  status: CommanderStatus
  linked_google_uid: string | null
  verification_status: VerificationStatus
  inactive_flagged: boolean
  inactive_flagged_at: string | null
  created_at: string
  updated_at: string
}

export interface AllianceHistory {
  id: string
  commander_uid: string
  alliance_id: string
  alliance_tag: string
  role: Role
  joined_at: string
  left_at: string | null
}

// ─── ALLIANCE ────────────────────────────────
export interface Alliance {
  id: string
  tag: string
  name: string
  r5_uid: string | null
  status: 'active' | 'inactive'
  created_at: string
  created_by_supreme: string
}

// ─── VERIFICATION ────────────────────────────
export interface VerificationCode {
  commander_uid: string
  code: string
  created_at: string
  expires_at: string
  used: boolean
  attempt_count: number
}

// ─── TRANSFER ────────────────────────────────
export type TransferStatus = 'pending' | 'approved' | 'rejected'

export interface TransferRequest {
  id: string
  commander_uid: string
  commander_name: string
  from_alliance_id: string | null
  from_alliance_tag: string | null
  to_alliance_id: string
  status: TransferStatus
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

// ─── DUEL ────────────────────────────────────
export type DuelMode = 'full' | 'quick'
export type DuelDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'
export type DuelEntryStatus = 'passed' | 'below_minimum' | 'absent' | 'skipped'

export const DUEL_POINT_VALUES: Record<DuelDay, number> = {
  monday:    1,
  tuesday:   2,
  wednesday: 2,
  thursday:  2,
  friday:    2,
  saturday:  4,
}

export const DUEL_DAY_NAMES: Record<DuelDay, string> = {
  monday:    'Monday — Radar Training',
  tuesday:   'Tuesday — Base Expansion',
  wednesday: 'Wednesday — Age of Science',
  thursday:  'Thursday — Train Heroes',
  friday:    'Friday — Total Mobilization',
  saturday:  'Saturday — Enemy Buster',
}

export interface DuelWeek {
  id: string
  alliance_id: string
  week_key: string
  week_start: string
  mode: DuelMode
  minimum_score: number | null
  created_by: string
  created_at: string
}

export interface DuelEntry {
  id: string
  duel_week_id: string
  commander_uid: string
  day: DuelDay
  status: DuelEntryStatus
  score: number | null
  day_locked: boolean
  locked_at: string | null
  locked_by: string | null
  created_at: string
}

// ─── DSB ─────────────────────────────────────
export type DSBState = 'pending' | 'registration_open' | 'registration_closed' | 'battle' | 'complete'
export type DSBSlot = '09:00' | '18:00' | '23:00'
export type TaskForceId = 'A' | 'B'

export interface DSBEvent {
  id: string
  alliance_id: string
  week_key: string
  week_start: string
  state: DSBState
  registration_enabled: boolean
  tfa_slot: DSBSlot | null
  tfb_slot: DSBSlot | null
  tfa_finalized: boolean
  tfb_finalized: boolean
  created_by: string
  updated_at: string
}

// ─── CANYON ──────────────────────────────────
export type CanyonState = 'pending' | 'registration_open' | 'registration_closed' | 'battle' | 'complete'
export type CanyonSlot = '12:00' | '23:00'
export type CanyonSide = 'rulebringers' | 'dawnbreakers'

export interface CanyonEvent {
  id: string
  alliance_id: string
  week_key: string
  week_start: string
  state: CanyonState
  registration_enabled: boolean
  tfa_side: CanyonSide | null
  tfa_slot: CanyonSlot | null
  tfb_side: CanyonSide | null
  tfb_slot: CanyonSlot | null
  tfa_side_finalized: boolean
  tfb_side_finalized: boolean
  tfa_finalized: boolean
  tfb_finalized: boolean
  created_by: string
  updated_at: string
}

// ─── SHARED ROSTER / ATTENDANCE ──────────────
export type RosterRole = 'starter' | 'substitute'
export type EventType = 'dsb' | 'canyon'

export interface EventRoster {
  id: string
  event_id: string
  event_type: EventType
  commander_uid: string
  task_force: TaskForceId
  roster_role: RosterRole
  added_by: string
  added_at: string
}

export type AttendanceStatus = 'attended' | 'no_show' | 'late' | 'backup' | 'emergency' | 'afk' | 'absent'

export interface AttendanceRecord {
  id: string
  event_id: string
  event_type: EventType
  commander_uid: string
  task_force: TaskForceId
  status: AttendanceStatus
  remark: string | null
  recorded_by: string
  recorded_at: string
}

// ─── AUDIT LOG ───────────────────────────────
export type AuditAction =
  | 'commander_created'
  | 'commander_updated'
  | 'commander_disabled'
  | 'commander_enabled'
  | 'verification_rejected'
  | 'verification_approved'
  | 'google_account_reset'
  | 'role_changed'
  | 'alliance_created'
  | 'alliance_updated'
  | 'member_added'
  | 'member_removed'
  | 'transfer_requested'
  | 'transfer_approved'
  | 'transfer_rejected'
  | 'verification_completed'
  | 'duel_day_locked'
  | 'minimum_score_set'
  | 'dsb_team_updated'
  | 'dsb_attendance_recorded'
  | 'canyon_team_updated'
  | 'canyon_attendance_recorded'
  | 'inactive_flagged'

export interface AuditLog {
  id: string
  action: AuditAction
  performed_by: string
  performed_by_role: Role | 'system'
  performed_by_display: string
  target_commander_uid: string | null
  target_alliance_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ─── NOTIFICATIONS ────────────────────────────
export type NotificationType = 'inactive_flag' | 'transfer_request' | 'dsb_reminder' | 'canyon_reminder'

export interface Notification {
  id: string
  type: NotificationType
  commander_uid: string
  commander_name: string
  alliance_id: string
  message: string
  read: boolean
  created_at: string
}

// ─── SESSION ──────────────────────────────────
export interface SessionUser {
  firebase_uid: string
  commander_uid: string
  commander_name: string
  role: Role
  alliance_id: string | null
  alliance_tag: string | null
}

// ─── QUICK ENTRY PAYLOAD ─────────────────────
export interface QuickEntryPayload {
  week_id: string
  alliance_id: string
  day: DuelDay
  minimum_score: number
  participated: string[]
  below_minimum: string[]
  absent: string[]
}

// ─── API RESPONSES ────────────────────────────
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  status: number
}