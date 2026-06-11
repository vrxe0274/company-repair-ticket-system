-- ============================================================
-- VRXE Repair Ticket System — Undo Status Setup
-- Adds a previous_status column so Admin/Technician can revert
-- the last status change from the ticket detail page.
--
-- Run this once in the Supabase SQL editor.
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN (
      'Pending',
      'Inspection & Quote',
      'Repair in Progress',
      'Done',
      'Paid',
      'Denied'
    ));

-- ============================================================
-- Done!
-- The app writes the old status into previous_status on every
-- forward transition, and clears it after an undo.
-- ============================================================
