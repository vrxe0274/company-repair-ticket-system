-- ============================================================
-- VRXE Repair Ticket System — Web Push Subscriptions Setup
-- Run this ONCE in the Supabase SQL Editor (after the main
-- supabase-setup.sql and notifications-setup.sql have been run).
-- ============================================================


-- ============================================================
-- STEP 1 — Create the push_subscriptions table
--
-- One row per device/browser that granted notification permission.
-- The app has no user accounts (shared-password login), so a
-- subscription is identified by its unique push endpoint and
-- tagged with the role that was active when it subscribed.
-- ============================================================

CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- The push service URL for this device (unique per browser/device)
  endpoint TEXT NOT NULL UNIQUE,

  -- Encryption keys from PushSubscription.toJSON().keys
  p256dh TEXT NOT NULL,
  auth   TEXT NOT NULL,

  -- Role active at subscribe time ('Admin' or 'Technician').
  -- Informational only — global pushes go to ALL active rows.
  role TEXT CHECK (role IN ('Admin', 'Technician')),

  -- For debugging which device a row belongs to
  user_agent TEXT,

  -- Deactivated instead of deleted when delivery starts failing
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Refreshed every time the device re-subscribes / logs in
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- STEP 2 — Index (the send function selects active rows)
-- ============================================================

CREATE INDEX idx_push_subscriptions_active
  ON push_subscriptions (active);


-- ============================================================
-- STEP 3 — Enable Row Level Security
-- ============================================================

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 4 — RLS policies (public, consistent with the existing
-- tickets / notifications tables — this app authenticates in
-- the client, not via Supabase Auth)
-- ============================================================

CREATE POLICY "Allow public read push_subscriptions"
  ON push_subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert push_subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update push_subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete push_subscriptions"
  ON push_subscriptions FOR DELETE
  USING (true);


-- ============================================================
-- Done! Now deploy the Edge Function and set its secrets:
--
--   supabase functions deploy send-push --no-verify-jwt
--   supabase secrets set VAPID_PUBLIC_KEY=...
--   supabase secrets set VAPID_PRIVATE_KEY=...
--   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
--
-- (see supabase/functions/send-push/index.ts)
-- ============================================================
