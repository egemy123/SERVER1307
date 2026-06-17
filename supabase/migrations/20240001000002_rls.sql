-- ============================================================
-- ACC PLATFORM — ROW LEVEL SECURITY POLICIES
-- Migration: 003_rls.sql
-- Run AFTER 002_indexes.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE commanders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_weeks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsb_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE canyon_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_roster        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NOTE ON HYBRID ARCHITECTURE
-- This app uses Firebase Auth + Supabase DB.
-- auth.uid() is NOT populated by Firebase.
-- All server actions use the SERVICE ROLE KEY which bypasses RLS.
-- These policies are a DEFENCE-IN-DEPTH backstop.
-- Primary security is enforced in Next.js server actions.
-- ============================================================

-- Allow service role full access (used by all server actions)
-- This is automatic in Supabase — service role bypasses RLS.

-- ============================================================
-- COMMANDERS
-- ============================================================

-- Anon/authenticated can read commanders in their scope
-- (In hybrid arch, actual scoping is done in server actions)
-- These policies allow the anon key to read for public lookups
-- during the verification flow

CREATE POLICY "commanders_public_lookup"
ON commanders FOR SELECT
TO anon, authenticated
USING (true);
-- Note: verification flow needs to look up commander by UID
-- Server actions enforce proper scoping after this public read

CREATE POLICY "commanders_no_client_insert"
ON commanders FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "commanders_no_client_update"
ON commanders FOR UPDATE
TO anon, authenticated
USING (false);

CREATE POLICY "commanders_no_client_delete"
ON commanders FOR DELETE
TO anon, authenticated
USING (false);

-- ============================================================
-- ALLIANCES
-- ============================================================

CREATE POLICY "alliances_public_read"
ON alliances FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "alliances_no_client_write"
ON alliances FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "alliances_no_client_update"
ON alliances FOR UPDATE
TO anon, authenticated
USING (false);

-- ============================================================
-- ALLIANCE HISTORY
-- ============================================================

CREATE POLICY "alliance_history_read"
ON alliance_history FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "alliance_history_no_client_write"
ON alliance_history FOR INSERT
TO anon, authenticated
WITH CHECK (false);

-- ============================================================
-- VERIFICATION CODES — NO CLIENT READ EVER
-- ============================================================

-- No SELECT policy = no client can read verification codes
-- All code operations go through API routes with service role

CREATE POLICY "verification_codes_no_client_access"
ON verification_codes FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ============================================================
-- TRANSFER REQUESTS
-- ============================================================

CREATE POLICY "transfer_requests_read"
ON transfer_requests FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "transfer_requests_no_client_write"
ON transfer_requests FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "transfer_requests_no_client_update"
ON transfer_requests FOR UPDATE
TO anon, authenticated
USING (false);

-- ============================================================
-- DUEL WEEKS + ENTRIES
-- ============================================================

CREATE POLICY "duel_weeks_read"
ON duel_weeks FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "duel_weeks_no_client_write"
ON duel_weeks FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "duel_entries_read"
ON duel_entries FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "duel_entries_no_client_write"
ON duel_entries FOR INSERT
TO anon, authenticated
WITH CHECK (false);

-- ============================================================
-- DSB + CANYON EVENTS
-- ============================================================

CREATE POLICY "dsb_events_read"
ON dsb_events FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "dsb_events_no_client_write"
ON dsb_events FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "canyon_events_read"
ON canyon_events FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "canyon_events_no_client_write"
ON canyon_events FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ============================================================
-- EVENT ROSTER
-- ============================================================

CREATE POLICY "event_roster_read"
ON event_roster FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "event_roster_no_client_write"
ON event_roster FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ============================================================
-- ATTENDANCE RECORDS
-- ============================================================

CREATE POLICY "attendance_read"
ON attendance_records FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "attendance_no_client_write"
ON attendance_records FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- ============================================================
-- AUDIT LOGS — NO CLIENT INSERT EVER
-- ============================================================

CREATE POLICY "audit_logs_read"
ON audit_logs FOR SELECT
TO anon, authenticated
USING (true);

-- No INSERT policy for clients = clients can never write audit logs
-- All audit writes via service role in server actions

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE POLICY "notifications_read"
ON notifications FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "notifications_no_client_write"
ON notifications FOR INSERT
TO anon, authenticated
WITH CHECK (false);

-- Allow client to mark notifications as read
CREATE POLICY "notifications_mark_read"
ON notifications FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);