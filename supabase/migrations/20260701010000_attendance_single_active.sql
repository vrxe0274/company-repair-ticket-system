-- Enforce at most ONE open ("Active") attendance_logs row per account.
--
-- "Account" identity = (role, username), treating NULL username (shared-password
-- Admin/Technician roles) as a single bucket per role.
--
-- Client-side sweeps (useAuth.jsx) can miss: background-killed tabs never fire
-- beforeunload, and concurrent logins from multiple devices race. This trigger
-- closes any still-open row for the same identity in the SAME transaction as the
-- new insert, so a second Active row can never exist regardless of the client.

CREATE OR REPLACE FUNCTION close_prior_open_attendance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE attendance_logs
  SET    logged_out_at = now(),
         logout_reason = 'superseded'
  WHERE  logged_out_at IS NULL
    AND  role = NEW.role
    AND  COALESCE(username, '') = COALESCE(NEW.username, '')
    AND  id <> NEW.id;   -- no-op guard; NEW.id not yet in table on INSERT
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_prior_open_attendance ON attendance_logs;

CREATE TRIGGER trg_close_prior_open_attendance
  BEFORE INSERT ON attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION close_prior_open_attendance();

-- One-time backfill: collapse any existing duplicate open rows, keeping only the
-- most recent open row per identity.
UPDATE attendance_logs a
SET    logged_out_at = now(),
       logout_reason = 'superseded'
WHERE  a.logged_out_at IS NULL
  AND  EXISTS (
    SELECT 1 FROM attendance_logs b
    WHERE  b.logged_out_at IS NULL
      AND  b.role = a.role
      AND  COALESCE(b.username, '') = COALESCE(a.username, '')
      AND  b.logged_in_at > a.logged_in_at
  );
