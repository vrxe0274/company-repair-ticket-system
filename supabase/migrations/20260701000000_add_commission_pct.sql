-- Add nullable per-account commission override columns.
-- NULL means "use the role-wide default from app_settings (commission_rates)".
ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC
    CHECK (commission_pct >= 0 AND commission_pct <= 1);

ALTER TABLE technician_accounts
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC
    CHECK (commission_pct >= 0 AND commission_pct <= 1);
