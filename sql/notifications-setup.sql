-- ============================================================
-- VRXE Repair Ticket System — Notifications Setup
-- Run this ONCE in the Supabase SQL Editor (after the main
-- supabase-setup.sql has already been run).
-- ============================================================


-- ============================================================
-- STEP 1 — Create the notifications table
-- ============================================================

CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Who should see this notification: 'Admin', 'Staff', or 'Technician'
  recipient_role TEXT NOT NULL
    CHECK (recipient_role IN ('Admin', 'Staff', 'Technician')),

  -- The notification text shown in the UI
  message TEXT NOT NULL,

  -- A category, e.g. 'status_change', 'new_ticket', 'info'
  type TEXT NOT NULL DEFAULT 'info',

  -- Has the recipient seen it yet?
  seen BOOLEAN NOT NULL DEFAULT FALSE,

  -- Link back to the related ticket (auto-removed if the ticket is deleted)
  ticket_uuid UUID REFERENCES tickets(id) ON DELETE CASCADE,

  -- Human-readable ticket id (e.g. VRXE-20241210-A3F7) for display
  ticket_human_id TEXT
);


-- ============================================================
-- STEP 2 — Indexes (fast lookups for the sidebar badge + list)
-- ============================================================

CREATE INDEX idx_notifications_recipient_seen
  ON notifications (recipient_role, seen);

CREATE INDEX idx_notifications_created_at
  ON notifications (created_at DESC);


-- ============================================================
-- STEP 3 — Enable Row Level Security
-- ============================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 4 — RLS policies (public, consistent with tickets table)
-- ============================================================

CREATE POLICY "Allow public read notifications"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update notifications"
  ON notifications FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete notifications"
  ON notifications FOR DELETE
  USING (true);


-- ============================================================
-- STEP 5 — Enable Realtime so the sidebar updates live
-- (If it errors saying the table is already in the publication,
--  that's fine — it just means realtime is already enabled.)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ============================================================
-- Done! Notifications are ready.
-- ============================================================
