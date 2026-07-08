-- Replace the global default/override commission system with real per-ticket
-- assignment + manual, per-repair commission percentages set by Admin after
-- the client has paid. NULL pct means "not yet inputted by Admin" — there is
-- no fallback default anymore.

-- Real per-ticket assignment (previously unused columns) — store USERNAMES
-- (not display names) so a later account rename doesn't orphan historical
-- commission data; live display names are resolved the same way
-- attendanceExport.js does (fetch current name from *-manage list-names).
ALTER TABLE tickets RENAME COLUMN technician_name TO technician_username;
COMMENT ON COLUMN tickets.technician_username IS 'Username of the technician who handled this repair (set by Admin when inputting commission after payment).';
COMMENT ON COLUMN tickets.assigned_staff IS 'Usernames of staff who handled this repair (set by Admin when inputting commission after payment).';

-- Manual, per-ticket, per-role commission — no default/fallback. NULL means
-- "not yet inputted by Admin".
ALTER TABLE tickets ADD COLUMN tech_commission_pct  NUMERIC(5,4)
  CHECK (tech_commission_pct  IS NULL OR (tech_commission_pct  >= 0 AND tech_commission_pct  <= 1));
ALTER TABLE tickets ADD COLUMN staff_commission_pct NUMERIC(5,4)
  CHECK (staff_commission_pct IS NULL OR (staff_commission_pct >= 0 AND staff_commission_pct <= 1));

-- Remove the legacy default/override system entirely.
ALTER TABLE staff_accounts      DROP COLUMN IF EXISTS commission_pct;
ALTER TABLE technician_accounts DROP COLUMN IF EXISTS commission_pct;
DELETE FROM app_settings WHERE key IN ('commission_rates', 'commission_overrides');
