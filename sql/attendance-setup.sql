-- ============================================================
-- VRXE Repair Ticket System — Attendance Logs
--
-- Records each login event for Staff and Technician accounts.
-- logged_out_at is filled on explicit logout (logout_reason='manual') or by
-- session-expiry cleanup (logout_reason='session_expired') — either the nightly
-- close_stale_attendance() sweep or single-session revocation when the same
-- account logs in on another device. See sql/sessions-setup.sql.
-- A row still open on a PAST day only appears if that cleanup hasn't run yet.
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_logs (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  username       TEXT,                          -- null for shared-password roles (Admin)
  role           TEXT        NOT NULL,          -- 'Admin' | 'Staff' | 'Technician'
  name           TEXT,                          -- display name at time of login
  logged_in_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  logged_out_at  TIMESTAMPTZ,                   -- null = session still open / unclosed
  logout_reason  TEXT                           -- 'manual' | 'session_expired'
);

-- Index for the date-range queries the attendance page runs
CREATE INDEX IF NOT EXISTS attendance_logs_logged_in_at_idx
  ON attendance_logs (logged_in_at DESC);

-- Index for per-user monthly queries (AccountsPage modal)
CREATE INDEX IF NOT EXISTS attendance_logs_username_idx
  ON attendance_logs (username, logged_in_at DESC);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Anon can insert (login events fire from the browser)
CREATE POLICY "anon insert attendance"
  ON attendance_logs FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anon can read (admin page reads directly via Supabase client;
-- route-level ProtectedRoute requiredRole="Admin" guards the UI)
CREATE POLICY "anon read attendance"
  ON attendance_logs FOR SELECT
  TO anon
  USING (true);

-- Anon can update (to set logged_out_at on logout / session expiry)
CREATE POLICY "anon update attendance"
  ON attendance_logs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
