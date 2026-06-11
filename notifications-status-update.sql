-- ============================================================
-- VRXE Repair Ticket System — Notification Status Column
-- Run this ONCE in the Supabase SQL Editor (after
-- notifications-setup.sql).
--
-- Adds a `status` column so each notification can show a
-- colored status indicator in the in-app list. Existing rows
-- keep NULL (rendered with a neutral gray dot).
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT;
