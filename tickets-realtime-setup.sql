-- ============================================================
-- VRXE Repair Ticket System — Live Ticket Updates Setup
-- Run this ONCE in the Supabase SQL Editor.
--
-- Adds the tickets table to the realtime publication so the
-- dashboard, ticket detail, and public tracking pages update
-- instantly without a refresh (notifications already have this
-- from notifications-setup.sql).
--
-- If it errors saying the table is already in the publication,
-- that's fine — realtime is already enabled.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
