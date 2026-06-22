-- migrations/005_fcm_tokens.sql
-- ACC #7C — Phase 4: FCM Push Notifications
-- Adds FCM token storage to commanders table + helper RPCs

-- ─── 1. Add fcm_tokens column to commanders ──────────────────────────────────

ALTER TABLE commanders
  ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

-- Index for fast token lookups (used by send route)
CREATE INDEX IF NOT EXISTS idx_commanders_fcm_tokens
  ON commanders USING GIN (fcm_tokens);

-- ─── 2. upsert_fcm_token — add token if not already present ─────────────────

CREATE OR REPLACE FUNCTION upsert_fcm_token(
  p_commander_id UUID,
  p_token        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE commanders
  SET fcm_tokens = CASE
    WHEN p_token = ANY(fcm_tokens) THEN fcm_tokens          -- already there
    ELSE array_append(fcm_tokens, p_token)                  -- add it
  END
  WHERE id = p_commander_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commander % not found', p_commander_id;
  END IF;
END;
$$;

-- ─── 3. remove_fcm_token — remove a specific token ───────────────────────────

CREATE OR REPLACE FUNCTION remove_fcm_token(
  p_commander_id UUID,
  p_token        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE commanders
  SET fcm_tokens = array_remove(fcm_tokens, p_token)
  WHERE id = p_commander_id;
END;
$$;

-- ─── 4. prune_fcm_tokens — bulk remove stale tokens (called by send route) ───

CREATE OR REPLACE FUNCTION prune_fcm_tokens(p_tokens TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE commanders
  SET fcm_tokens = ARRAY(
    SELECT unnest(fcm_tokens)
    EXCEPT
    SELECT unnest(p_tokens)
  )
  WHERE fcm_tokens && p_tokens;  -- only touch rows that actually have these tokens
END;
$$;

-- ─── 5. RLS — commanders can only read/write their own row ───────────────────
-- (Existing RLS already covers this — the RPCs use SECURITY DEFINER
--  so service-role callers bypass RLS safely.)

-- ─── 6. Grant execute on RPCs to authenticated role ─────────────────────────

GRANT EXECUTE ON FUNCTION upsert_fcm_token(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_fcm_token(UUID, TEXT) TO authenticated;
-- prune_fcm_tokens is called by service role only — no grant needed