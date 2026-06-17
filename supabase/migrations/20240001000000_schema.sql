-- ============================================================
-- ACC PLATFORM — COMPLETE POSTGRESQL SCHEMA
-- Migration: 001_schema.sql
-- Run this FIRST before any other migration
-- ============================================================

-- Enable required extensions


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE role_enum AS ENUM ('supreme','r5','r4','r3','r2','r1');
CREATE TYPE commander_status AS ENUM ('active','inactive','disabled','former','unassigned');
CREATE TYPE verification_status AS ENUM ('pending','code_sent','verified','linked');
CREATE TYPE transfer_status AS ENUM ('pending','approved','rejected');
CREATE TYPE duel_mode AS ENUM ('full','quick');
CREATE TYPE duel_day AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday');
CREATE TYPE duel_entry_status AS ENUM ('passed','below_minimum','absent','skipped');
CREATE TYPE dsb_state AS ENUM ('pending','registration_open','registration_closed','battle','complete');
CREATE TYPE dsb_slot AS ENUM ('09:00','18:00','23:00');
CREATE TYPE canyon_state AS ENUM ('pending','registration_open','registration_closed','battle','complete');
CREATE TYPE canyon_slot AS ENUM ('12:00','23:00');
CREATE TYPE canyon_side AS ENUM ('rulebringers','dawnbreakers');
CREATE TYPE task_force_id AS ENUM ('A','B');
CREATE TYPE roster_role AS ENUM ('starter','substitute');
CREATE TYPE attendance_status AS ENUM ('attended','no_show','late','backup','emergency','afk','absent');
CREATE TYPE event_type AS ENUM ('dsb','canyon');
CREATE TYPE audit_action AS ENUM (
  'commander_created','commander_updated','commander_disabled','commander_enabled',
  'google_account_reset','role_changed','alliance_created','alliance_updated',
  'member_added','member_removed','transfer_requested','transfer_approved',
  'transfer_rejected','verification_completed','duel_day_locked','minimum_score_set',
  'dsb_team_updated','dsb_attendance_recorded','canyon_team_updated',
  'canyon_attendance_recorded','inactive_flagged'
);

-- ============================================================
-- ALLIANCES
-- Created before commanders because commanders FK to alliances
-- ============================================================

CREATE TABLE alliances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag                 VARCHAR(5) NOT NULL UNIQUE,
  name                VARCHAR(100) NOT NULL,
  r5_uid              VARCHAR(50),
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_supreme  VARCHAR(50) NOT NULL DEFAULT 'system'
);

-- ============================================================
-- COMMANDERS
-- ============================================================

CREATE TABLE commanders (
  uid                   VARCHAR(50) PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL UNIQUE,
  alliance_id           UUID REFERENCES alliances(id) ON DELETE SET NULL,
  role                  role_enum NOT NULL DEFAULT 'r1',
  status                commander_status NOT NULL DEFAULT 'unassigned',
  linked_google_uid     TEXT UNIQUE,
  verification_status   verification_status NOT NULL DEFAULT 'pending',
  inactive_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  inactive_flagged_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from alliances to commanders (r5_uid)
ALTER TABLE alliances
  ADD CONSTRAINT fk_alliances_r5
  FOREIGN KEY (r5_uid) REFERENCES commanders(uid) ON DELETE SET NULL;

-- ============================================================
-- ALLIANCE HISTORY
-- ============================================================

CREATE TABLE alliance_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_uid   VARCHAR(50) NOT NULL REFERENCES commanders(uid) ON DELETE CASCADE,
  alliance_id     UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  alliance_tag    VARCHAR(5) NOT NULL,
  role            role_enum NOT NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at         TIMESTAMPTZ
);

-- ============================================================
-- VERIFICATION CODES
-- Server-side read only — no client SELECT policy
-- ============================================================

CREATE TABLE verification_codes (
  commander_uid   VARCHAR(50) PRIMARY KEY REFERENCES commanders(uid) ON DELETE CASCADE,
  code            VARCHAR(8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  used            BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count   INT NOT NULL DEFAULT 0
);

-- ============================================================
-- TRANSFER REQUESTS
-- ============================================================

CREATE TABLE transfer_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_uid       VARCHAR(50) NOT NULL REFERENCES commanders(uid) ON DELETE CASCADE,
  commander_name      VARCHAR(100) NOT NULL,
  from_alliance_id    UUID REFERENCES alliances(id) ON DELETE SET NULL,
  from_alliance_tag   VARCHAR(5),
  to_alliance_id      UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  status              transfer_status NOT NULL DEFAULT 'pending',
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by         VARCHAR(50) REFERENCES commanders(uid) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ
);

-- ============================================================
-- DUEL WEEKS
-- ============================================================

CREATE TABLE duel_weeks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id     UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  week_key        VARCHAR(10) NOT NULL,
  week_start      TIMESTAMPTZ NOT NULL,
  mode            duel_mode NOT NULL DEFAULT 'quick',
  minimum_score   BIGINT,
  created_by      VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alliance_id, week_key)
);

-- ============================================================
-- DUEL ENTRIES
-- ============================================================

CREATE TABLE duel_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_week_id    UUID NOT NULL REFERENCES duel_weeks(id) ON DELETE CASCADE,
  commander_uid   VARCHAR(50) NOT NULL REFERENCES commanders(uid) ON DELETE CASCADE,
  day             duel_day NOT NULL,
  status          duel_entry_status NOT NULL DEFAULT 'absent',
  score           BIGINT,
  day_locked      BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at       TIMESTAMPTZ,
  locked_by       VARCHAR(50) REFERENCES commanders(uid) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (duel_week_id, commander_uid, day)
);

-- ============================================================
-- DSB EVENTS
-- ============================================================

CREATE TABLE dsb_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id             UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  week_key                VARCHAR(10) NOT NULL,
  week_start              TIMESTAMPTZ NOT NULL,
  state                   dsb_state NOT NULL DEFAULT 'pending',
  registration_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  tfa_slot                dsb_slot,
  tfb_slot                dsb_slot,
  tfa_finalized           BOOLEAN NOT NULL DEFAULT FALSE,
  tfb_finalized           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by              VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alliance_id, week_key)
);

-- ============================================================
-- CANYON EVENTS
-- ============================================================

CREATE TABLE canyon_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id             UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  week_key                VARCHAR(10) NOT NULL,
  week_start              TIMESTAMPTZ NOT NULL,
  state                   canyon_state NOT NULL DEFAULT 'pending',
  registration_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  tfa_side                canyon_side,
  tfa_slot                canyon_slot,
  tfb_side                canyon_side,
  tfb_slot                canyon_slot,
  tfa_side_finalized      BOOLEAN NOT NULL DEFAULT FALSE,
  tfb_side_finalized      BOOLEAN NOT NULL DEFAULT FALSE,
  tfa_finalized           BOOLEAN NOT NULL DEFAULT FALSE,
  tfb_finalized           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by              VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (alliance_id, week_key)
);

-- ============================================================
-- EVENT ROSTER (shared DSB + Canyon)
-- UNIQUE constraint enforces one commander per event across both TFs
-- ============================================================

CREATE TABLE event_roster (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL,
  event_type      event_type NOT NULL,
  commander_uid   VARCHAR(50) NOT NULL REFERENCES commanders(uid) ON DELETE CASCADE,
  task_force      task_force_id NOT NULL,
  roster_role     roster_role NOT NULL,
  added_by        VARCHAR(50) NOT NULL,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, event_type, commander_uid)
);

-- ============================================================
-- ATTENDANCE RECORDS (shared DSB + Canyon)
-- ============================================================

CREATE TABLE attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL,
  event_type      event_type NOT NULL,
  commander_uid   VARCHAR(50) NOT NULL REFERENCES commanders(uid) ON DELETE CASCADE,
  task_force      task_force_id NOT NULL,
  status          attendance_status NOT NULL,
  remark          TEXT,
  recorded_by     VARCHAR(50) NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, event_type, commander_uid)
);

-- ============================================================
-- AUDIT LOGS — IMMUTABLE, APPEND ONLY
-- ============================================================

CREATE TABLE audit_logs (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action                    audit_action NOT NULL,
  performed_by              VARCHAR(50) NOT NULL,
  performed_by_role         TEXT NOT NULL,
  performed_by_display      TEXT NOT NULL,
  target_commander_uid      VARCHAR(50),
  target_alliance_id        UUID,
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (
                    type IN ('inactive_flag','transfer_request','dsb_reminder','canyon_reminder')
                  ),
  commander_uid   VARCHAR(50) NOT NULL,
  commander_name  VARCHAR(100) NOT NULL,
  alliance_id     UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at on commanders
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER commanders_updated_at
  BEFORE UPDATE ON commanders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER dsb_events_updated_at
  BEFORE UPDATE ON dsb_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER canyon_events_updated_at
  BEFORE UPDATE ON canyon_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Prevent audit log mutation (immutability enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable. Updates and deletes are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_audit_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

CREATE TRIGGER no_audit_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();