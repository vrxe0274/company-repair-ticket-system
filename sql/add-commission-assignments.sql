-- Add technician assignment and staff assignment columns to tickets.
-- Run once in the Supabase SQL editor.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS technician_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_staff  TEXT[] NOT NULL DEFAULT '{}';
