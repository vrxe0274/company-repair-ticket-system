-- staff_accounts — individual Staff user accounts
--
-- Each row is one staff member who can log in with their own
-- username and password. Only Edge Functions (service-role key) can
-- read or write this table; the anon key has no access.
--
-- Run once against your Supabase project:
--   supabase db push   (if using migrations)
--   or paste into the Supabase SQL editor

CREATE TABLE IF NOT EXISTS staff_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        UNIQUE NOT NULL
                              CHECK (char_length(username) BETWEEN 3 AND 30
                                     AND username ~ '^[a-zA-Z0-9_]+$'),
  password_hash TEXT        NOT NULL,
  name          TEXT        DEFAULT NULL,  -- display name, set by staff on first login
  created_by    TEXT        NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock down: no public access whatsoever.
-- Only the service-role key used by Edge Functions can touch this table.
ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;

-- Intentionally no RLS policies — anon and authenticated roles are denied.
