-- Enforce ticket status transitions server-side.
--
-- Forward transitions (what each role is allowed to do):
--   Pending            → Inspection & Quote  (Admin)
--   Pending            → Denied              (Admin)
--   Inspection & Quote → Repair in Progress  (Admin or Technician)
--   Repair in Progress → Done                (Technician)
--   Done               → Paid                (Admin)
--
-- Undo transition (single-level rollback, any role):
--   Allowed only when NEW.previous_status IS NULL and NEW.status matches
--   the OLD.previous_status stored on the row. This mirrors undoStatus() in
--   useTicket.jsx which sets { status: previous_status, previous_status: null }.
--
-- Everything else is rejected.

CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op: status field is not changing (e.g. saving notes, uploading photos)
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Undo: reverting to the previously stored status.
  -- Condition: previous_status is being cleared to NULL, and the new status
  -- exactly matches what was stored as previous_status. This is the only
  -- legitimate backwards move in the app.
  IF NEW.previous_status IS NULL
     AND OLD.previous_status IS NOT NULL
     AND NEW.status = OLD.previous_status
  THEN
    RETURN NEW;
  END IF;

  -- Forward transitions
  IF
    (OLD.status = 'Pending'            AND NEW.status IN ('Inspection & Quote', 'Denied')) OR
    (OLD.status = 'Inspection & Quote' AND NEW.status = 'Repair in Progress')              OR
    (OLD.status = 'Repair in Progress' AND NEW.status = 'Done')                            OR
    (OLD.status = 'Done'               AND NEW.status = 'Paid')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition: "%" → "%"', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

-- Drop first so this file is safe to re-run
DROP TRIGGER IF EXISTS check_status_transition ON tickets;

CREATE TRIGGER check_status_transition
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_status_transition();
