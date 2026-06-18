-- ============================================================
-- VRXE Repair Ticket System — Payment Proof
--
-- Adds a column to store the URL of the payment-proof screenshot the admin
-- must upload before saving the final payment (and thus before a ticket can
-- be marked Paid). The image itself goes in the existing `repair-photos`
-- storage bucket (under a payment-proof/ path), so no new bucket or policy
-- is needed.
--
-- Run this in: Supabase → SQL Editor.
-- ============================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
