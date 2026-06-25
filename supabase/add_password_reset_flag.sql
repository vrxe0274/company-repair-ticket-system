-- Add password_reset_required flag to staff and technician accounts.
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query).

ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE technician_accounts
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;
