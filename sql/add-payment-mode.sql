-- ============================================================
-- Migration — Client payment mode selection
-- Adds:
--   tickets.payment_mode  (Cash / GCash / Bank Transfer)
--     Chosen by the client on the tracker page once a quotation
--     has been provided. Stored independently of payment_option
--     (which tracks the payment plan / discount tier).
--
-- Safe to re-run (IF NOT EXISTS + DROP/re-add CHECK).
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS payment_mode TEXT;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_payment_mode_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'GCash', 'Bank Transfer'));
