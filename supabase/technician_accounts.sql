-- technician_accounts table
-- Run this once in your Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Mirrors the structure of staff_accounts.

CREATE TABLE IF NOT EXISTS technician_accounts (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  username     TEXT        NOT NULL UNIQUE
                           CHECK (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  password_hash TEXT       NOT NULL,
  name         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   TEXT        DEFAULT 'admin'
);

-- Disable Row Level Security so the service-role key used by Edge Functions
-- has unrestricted access (same pattern as staff_accounts).
ALTER TABLE technician_accounts DISABLE ROW LEVEL SECURITY;
