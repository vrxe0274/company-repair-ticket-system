-- ============================================================
-- Add 'Staff' as a valid recipient_role for notifications.
--
-- The original constraint only allowed 'Admin' and 'Technician'.
-- The system now has a separate Staff role that needs its own
-- notification queue. Without this, all Staff-targeted inserts
-- silently fail the check constraint.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_recipient_role_check
  CHECK (recipient_role IN ('Admin', 'Staff', 'Technician'));
