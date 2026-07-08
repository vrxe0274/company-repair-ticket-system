-- Replace the global default/override commission system with real per-ticket
-- assignment + manual, per-repair commission percentages set by Admin after
-- the client has paid. NULL pct means "not yet inputted by Admin" — there is
-- no fallback default anymore.

-- Real per-ticket assignment (previously unused/single-value columns) — store
-- USERNAMES (not display names) so a later account rename doesn't orphan
-- historical commission data; live display names are resolved the same way
-- attendanceExport.js does (fetch current name from *-manage list-names).
-- Multiple technicians can work a single repair, same as staff, so this is an
-- array — each assigned technician gets the same tech_commission_pct, same as
-- how assigned_staff already works.
ALTER TABLE tickets DROP COLUMN IF EXISTS technician_name;
ALTER TABLE tickets DROP COLUMN IF EXISTS technician_username;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS technician_usernames TEXT[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN tickets.technician_usernames IS 'Usernames of technicians who handled this repair (set by Admin when inputting commission after payment).';
COMMENT ON COLUMN tickets.assigned_staff IS 'Usernames of staff who handled this repair (set by Admin when inputting commission after payment).';

-- Manual, per-ticket, per-role commission — no default/fallback. NULL means
-- "not yet inputted by Admin".
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tech_commission_pct  NUMERIC(5,4)
  CHECK (tech_commission_pct  IS NULL OR (tech_commission_pct  >= 0 AND tech_commission_pct  <= 1));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS staff_commission_pct NUMERIC(5,4)
  CHECK (staff_commission_pct IS NULL OR (staff_commission_pct >= 0 AND staff_commission_pct <= 1));

-- Remove the legacy default/override system entirely.
ALTER TABLE staff_accounts      DROP COLUMN IF EXISTS commission_pct;
ALTER TABLE technician_accounts DROP COLUMN IF EXISTS commission_pct;
DELETE FROM app_settings WHERE key IN ('commission_rates', 'commission_overrides');
