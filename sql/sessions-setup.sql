-- ============================================================
-- VRXE Repair Ticket System — Server-side Sessions
--
-- Login is verified server-side (the *-login Edge Functions). On success the
-- function creates a row here and returns the random `token`. The token is what
-- proves a session for token-gated actions (session-validate / session-revoke),
-- so a hand-edited localStorage record on the client can no longer forge one.
--
-- SECURITY: this table is NEVER exposed to the anon client. RLS is enabled with
-- NO anon policies, so the browser's anon key cannot read or write it. Only the
-- Edge Functions (service_role, which bypasses RLS) touch it — the token never
-- reaches a context where another user could read it out of the table.
--
-- NOTE ON SCOPE: this hardens the SESSION object (revocable, expiring,
-- single-device per account). It does NOT by itself lock down the data tables
-- (attendance_logs, tickets, …) which still use permissive anon RLS. Gating
-- those on a valid token is a follow-up; see the note at the bottom.
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  token             TEXT        PRIMARY KEY,          -- random 256-bit, base64url
  role              TEXT        NOT NULL,             -- 'Admin' | 'Staff' | 'Technician'
  username          TEXT,                             -- null for shared-password roles (Admin)
  name              TEXT,                             -- display name at login time
  persistent        BOOLEAN     DEFAULT false NOT NULL, -- drives the sliding-expiry window
  attendance_log_id UUID        REFERENCES attendance_logs(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_seen_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL
);

-- Single-session-per-account enforcement + expiry sweeps hit these.
CREATE INDEX IF NOT EXISTS sessions_username_idx   ON sessions (username);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- ── Row-Level Security: locked to service_role only ───────────────────────────
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- No anon policies are created on purpose. With RLS enabled and no policy, the
-- anon key gets zero rows and zero writes. service_role bypasses RLS entirely,
-- so the Edge Functions keep full access.

-- ============================================================
-- Attendance stale-session cleanup
--
-- Closes attendance rows that were never closed by an explicit logout — the
-- multi-device / PWA / tab-close / crash cases. Without this an abandoned
-- device leaves a row open forever, showing a perpetual "Active".
--
-- A row is "stale" when it is still open (logged_out_at IS NULL) and its login
-- happened on an earlier day than now(). We close it at the END OF ITS LOGIN
-- DAY with logout_reason='session_expired' (the UI already renders an "(exp)"
-- tag for that reason). This is an APPROXIMATION of when work ended — the only
-- accurate close is an explicit logout. It exists to stop dangling rows and to
-- let per-day attendance rotate (session-validate opens a fresh row once the
-- old one is closed), not to be a precise timeclock.
-- ============================================================

CREATE OR REPLACE FUNCTION close_stale_attendance()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  affected integer;
BEGIN
  -- Close attendance rows left open from a previous day.
  UPDATE attendance_logs
     SET logged_out_at  = date_trunc('day', logged_in_at) + interval '1 day' - interval '1 second',
         logout_reason  = 'session_expired'
   WHERE logged_out_at IS NULL
     AND logged_in_at < date_trunc('day', now());
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Drop expired session rows (their attendance is closed by the sweep above or
  -- was already closed on the device). ON DELETE SET NULL keeps history intact.
  DELETE FROM sessions WHERE expires_at < now();

  RETURN affected;
END;
$$;

-- Schedule it nightly (00:05) via pg_cron. Enable the extension once, in the
-- Supabase dashboard (Database → Extensions → pg_cron) or here:
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Then (idempotent-ish — unschedule first if you re-run):
--   SELECT cron.schedule('close-stale-attendance', '5 0 * * *',
--                        $$SELECT close_stale_attendance();$$);
--
-- No pg_cron? Call SELECT close_stale_attendance(); from any daily trigger you
-- control (an external cron hitting a tiny Edge Function, etc.).

-- ============================================================
-- FOLLOW-UP (not done here): gate data-table RLS on a valid session token.
-- attendance_logs / tickets / *_accounts still allow the anon key broadly. To
-- fully close forgery, add a SQL helper like:
--   CREATE FUNCTION has_valid_session(tok text) RETURNS boolean ...
--     SELECT EXISTS (SELECT 1 FROM sessions WHERE token = tok AND expires_at > now());
-- and rewrite each table's policies to require it, passing the token from the
-- client on every request. That's a larger, app-wide change — tackle per table.
-- ============================================================
