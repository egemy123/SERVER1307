-- ============================================================
-- ACC PLATFORM — INDEXES
-- Migration: 002_indexes.sql
-- Run AFTER 001_schema.sql
-- ============================================================

-- commanders
CREATE INDEX idx_commanders_alliance_id     ON commanders(alliance_id);
CREATE INDEX idx_commanders_alliance_status ON commanders(alliance_id, status);
CREATE INDEX idx_commanders_alliance_role   ON commanders(alliance_id, role);
CREATE INDEX idx_commanders_linked_google   ON commanders(linked_google_uid);
CREATE INDEX idx_commanders_inactive        ON commanders(inactive_flagged)
  WHERE inactive_flagged = TRUE;

-- alliance_history
CREATE INDEX idx_alliance_history_commander ON alliance_history(commander_uid);
CREATE INDEX idx_alliance_history_alliance  ON alliance_history(alliance_id);

-- transfer_requests
CREATE INDEX idx_transfers_to_alliance      ON transfer_requests(to_alliance_id, status);
CREATE INDEX idx_transfers_commander        ON transfer_requests(commander_uid);
CREATE INDEX idx_transfers_pending          ON transfer_requests(status)
  WHERE status = 'pending';

-- duel_weeks
CREATE INDEX idx_duel_weeks_alliance_week   ON duel_weeks(alliance_id, week_key);

-- duel_entries
CREATE INDEX idx_duel_entries_week          ON duel_entries(duel_week_id);
CREATE INDEX idx_duel_entries_commander     ON duel_entries(commander_uid);
CREATE INDEX idx_duel_entries_status        ON duel_entries(duel_week_id, status);
CREATE INDEX idx_duel_entries_absent        ON duel_entries(commander_uid, status)
  WHERE status = 'absent';
CREATE INDEX idx_duel_entries_locked        ON duel_entries(duel_week_id, day_locked);

-- dsb_events
CREATE INDEX idx_dsb_events_alliance_week   ON dsb_events(alliance_id, week_key);
CREATE INDEX idx_dsb_events_state           ON dsb_events(state);

-- canyon_events
CREATE INDEX idx_canyon_events_alliance_week ON canyon_events(alliance_id, week_key);
CREATE INDEX idx_canyon_events_state         ON canyon_events(state);

-- event_roster
CREATE INDEX idx_event_roster_event         ON event_roster(event_id, event_type);
CREATE INDEX idx_event_roster_commander     ON event_roster(commander_uid);
CREATE INDEX idx_event_roster_tf            ON event_roster(event_id, event_type, task_force);

-- attendance_records
CREATE INDEX idx_attendance_event           ON attendance_records(event_id, event_type);
CREATE INDEX idx_attendance_commander       ON attendance_records(commander_uid);
CREATE INDEX idx_attendance_status          ON attendance_records(event_id, event_type, status);

-- audit_logs
CREATE INDEX idx_audit_logs_alliance        ON audit_logs(target_alliance_id, created_at DESC);
CREATE INDEX idx_audit_logs_commander       ON audit_logs(target_commander_uid, created_at DESC);
CREATE INDEX idx_audit_logs_action          ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_created         ON audit_logs(created_at DESC);

-- notifications
CREATE INDEX idx_notifications_alliance     ON notifications(alliance_id, read);
CREATE INDEX idx_notifications_created      ON notifications(created_at DESC);