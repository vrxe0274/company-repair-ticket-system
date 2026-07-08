-- ============================================================
-- VRXE Repair Ticket System — Full Database Setup
--
-- Single-file compilation of all SQL scripts in execution order.
-- Run this ONCE in the Supabase SQL Editor for a fresh project.
-- For an existing project, run only the sections you are missing.
--
-- Sections (in order):
--   1.  Tickets table + RLS + storage bucket
--   2.  Tickets table migrations (idempotent; no-ops on fresh setup)
--   3.  Status transition enforcement trigger
--   4.  Lock down ticket deletes (admin-delete Edge Function only)
--   5.  Realtime for tickets
--   6.  role_passwords table (verify-login / change-password)
--   7.  staff_accounts table (staff-login / staff-manage)
--   8.  app_settings table
--   9.  notifications table + RLS
--   10. notifications migrations (status column, Staff role)
--   11. Notification DB triggers (server-side creation, no anon INSERT)
--   12. Lock down notifications INSERT (triggers bypass RLS)
--   13. push_subscriptions table + RLS
--   14. Lock down push_subscriptions writes (manage-push Edge Function)
-- ============================================================


-- ============================================================
-- 1. TICKETS TABLE + RLS + STORAGE BUCKET
-- Source: supabase-setup.sql
-- ============================================================

CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Client info
  client_name TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  platform TEXT NOT NULL,

  -- Unit info
  unit_brand TEXT NOT NULL,
  unit_model TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  unit_condition TEXT,
  accessories_included TEXT,

  -- Issue
  issue_description TEXT NOT NULL,

  -- Appointment
  preferred_date DATE,
  preferred_time TEXT,
  mode_of_service TEXT NOT NULL,

  -- Status workflow
  -- Allowed values: Pending, Inspection & Quote, Repair in Progress, Done, Paid, Denied
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN (
      'Pending',
      'Inspection & Quote',
      'Repair in Progress',
      'Done',
      'Paid',
      'Denied'
    )),

  -- Internal fields (dashboard only — hidden from client until approved)
  diagnosis_notes TEXT,
  repair_notes TEXT,
  repair_photos TEXT[],

  -- Itemized pricing (Admin-only)
  labor_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Manual discount percentage (0–100); discount_amount is the resolved peso value.
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Computed totals
  quotation_amount NUMERIC(10,2),
  final_price NUMERIC(10,2),

  -- Payment plan — chosen by the client on the tracker page. The plan sets the
  -- maximum discount the admin may grant on the quotation:
  --   full_now  → up to payment_partial_high_pct% discount
  --   half_now  → up to payment_partial_low_pct%  discount
  --   pay_later → no discount
  payment_option TEXT
    CHECK (payment_option IS NULL OR payment_option IN ('full_now', 'half_now', 'pay_later')),
  payment_partial_high_pct NUMERIC(5,2) DEFAULT 40,
  payment_partial_low_pct  NUMERIC(5,2) DEFAULT 20,

  -- Mode of payment chosen by the client on the tracker page
  payment_mode TEXT
    CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'GCash', 'Bank Transfer')),

  -- Receipt number (auto-generated when marked Paid)
  receipt_number TEXT,

  -- Stamped automatically when status is moved to Paid
  paid_at TIMESTAMPTZ,

  -- Undo support: stores the previous status so Admin/Technician can revert
  previous_status TEXT
    CHECK (previous_status IS NULL OR previous_status IN (
      'Pending',
      'Inspection & Quote',
      'Repair in Progress',
      'Done',
      'Paid',
      'Denied'
    )),

  -- Payment-proof screenshot URL (required before marking Paid)
  payment_proof_url TEXT,

  -- Representative who handled the ticket
  representative_name TEXT,

  -- Technician and staff assignments — usernames of whoever handled the
  -- repair, set by Admin when inputting commission after payment.
  technician_username TEXT,
  assigned_staff       TEXT[] NOT NULL DEFAULT '{}',

  -- Manual, per-ticket commission percentages (0..1). NULL = not yet
  -- inputted by Admin — there is no default/fallback rate.
  tech_commission_pct  NUMERIC(5,4)
    CHECK (tech_commission_pct  IS NULL OR (tech_commission_pct  >= 0 AND tech_commission_pct  <= 1)),
  staff_commission_pct NUMERIC(5,4)
    CHECK (staff_commission_pct IS NULL OR (staff_commission_pct >= 0 AND staff_commission_pct <= 1)),

  -- Public tracking (unique token per ticket)
  tracking_token TEXT UNIQUE NOT NULL
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read"
  ON tickets FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update"
  ON tickets FOR UPDATE
  USING (true);

-- No public DELETE — handled by admin-delete Edge Function (section 4).

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage bucket for repair photos / documentation uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('repair-photos', 'repair-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public uploads to repair-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'repair-photos');

CREATE POLICY "Allow public read of repair-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'repair-photos');

-- No public DELETE on storage — handled by admin-delete Edge Function (section 4).


-- ============================================================
-- 2. TICKETS TABLE MIGRATIONS
-- Source: add-unit-condition-and-payment.sql, add-commission-assignments.sql,
--         add-payment-mode.sql, payment-proof-setup.sql, undo-status-setup.sql
--
-- All idempotent (IF NOT EXISTS). No-ops on a fresh setup because the
-- columns above are already defined in the CREATE TABLE. Safe to run
-- against an existing database that predates the full schema above.
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS unit_condition TEXT,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_option TEXT,
  ADD COLUMN IF NOT EXISTS payment_partial_high_pct NUMERIC(5,2) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS payment_partial_low_pct  NUMERIC(5,2) DEFAULT 20;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_payment_option_check;
UPDATE tickets
  SET payment_option = NULL
  WHERE payment_option IS NOT NULL
    AND payment_option NOT IN ('full_now', 'half_now', 'pay_later');
ALTER TABLE tickets ADD CONSTRAINT tickets_payment_option_check
  CHECK (payment_option IS NULL OR payment_option IN ('full_now', 'half_now', 'pay_later'));

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS technician_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_staff  TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS payment_mode TEXT;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_payment_mode_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'GCash', 'Bank Transfer'));

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

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
-- 3. STATUS TRANSITION ENFORCEMENT TRIGGER
-- Source: enforce-status-transitions.sql
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Undo: reverting to the previously stored status
  IF NEW.previous_status IS NULL
     AND OLD.previous_status IS NOT NULL
     AND NEW.status = OLD.previous_status
  THEN
    RETURN NEW;
  END IF;

  -- Forward transitions
  IF
    (OLD.status = 'Pending'            AND NEW.status IN ('Inspection & Quote', 'Denied')) OR
    (OLD.status = 'Inspection & Quote' AND NEW.status = 'Repair in Progress')              OR
    (OLD.status = 'Repair in Progress' AND NEW.status = 'Done')                            OR
    (OLD.status = 'Done'               AND NEW.status = 'Paid')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid status transition: "%" → "%"', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_status_transition ON tickets;
CREATE TRIGGER check_status_transition
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_status_transition();


-- ============================================================
-- 4. LOCK DOWN TICKET DELETES
-- Source: lock-deletes-setup.sql
--
-- After this, deletes only go through the admin-delete Edge Function.
-- It reuses ADMIN_PASSWORD (no separate delete password). Deploy it first:
--   supabase functions deploy admin-delete --no-verify-jwt
-- ============================================================

DROP POLICY IF EXISTS "Allow public delete" ON tickets;
DROP POLICY IF EXISTS "Allow public delete of repair-photos" ON storage.objects;


-- ============================================================
-- 5. REALTIME FOR TICKETS
-- Source: tickets-realtime-setup.sql
-- (If this errors saying the table is already in the publication,
--  realtime is already enabled — safe to ignore.)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;


-- ============================================================
-- 6. ROLE_PASSWORDS TABLE
-- Source: role-passwords-setup.sql
--
-- No public RLS policies — only service-role key (Edge Functions)
-- can read or write this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS role_passwords (
  role          TEXT        PRIMARY KEY,
  password_hash TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT role_passwords_role_check
    CHECK (role IN ('Admin', 'Staff', 'Technician'))
);

ALTER TABLE role_passwords ENABLE ROW LEVEL SECURITY;
-- (intentionally no public policies)


-- ============================================================
-- 7. STAFF_ACCOUNTS TABLE
-- Source: staff-accounts-setup.sql
--
-- Only Edge Functions (service-role key) can touch this table.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        UNIQUE NOT NULL
                              CHECK (char_length(username) BETWEEN 3 AND 30
                                     AND username ~ '^[a-zA-Z0-9_]+$'),
  password_hash TEXT        NOT NULL,
  name          TEXT        DEFAULT NULL,
  created_by    TEXT        NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;
-- (intentionally no public policies)


-- ============================================================
-- 8. APP_SETTINGS TABLE
-- Source: app-settings-setup.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT  PRIMARY KEY,
  value JSONB NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
  ON app_settings FOR SELECT USING (true);

CREATE POLICY "Public write app_settings"
  ON app_settings FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update app_settings"
  ON app_settings FOR UPDATE USING (true);

CREATE POLICY "Public delete app_settings"
  ON app_settings FOR DELETE USING (true);


-- ============================================================
-- 9. NOTIFICATIONS TABLE + RLS
-- Source: notifications-setup.sql
-- ============================================================

CREATE TABLE notifications (
  id             UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  recipient_role TEXT      NOT NULL
    CHECK (recipient_role IN ('Admin', 'Staff', 'Technician')),
  message        TEXT      NOT NULL,
  type           TEXT      NOT NULL DEFAULT 'info',
  status         TEXT,
  seen           BOOLEAN   NOT NULL DEFAULT FALSE,
  ticket_uuid    UUID      REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_human_id TEXT
);

CREATE INDEX idx_notifications_recipient_seen
  ON notifications (recipient_role, seen);

CREATE INDEX idx_notifications_created_at
  ON notifications (created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read notifications"
  ON notifications FOR SELECT
  USING (true);

-- INSERT intentionally omitted — created server-side by DB triggers (section 11).

CREATE POLICY "Allow public update notifications"
  ON notifications FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete notifications"
  ON notifications FOR DELETE
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ============================================================
-- 10. NOTIFICATIONS MIGRATIONS
-- Source: notifications-status-update.sql, notifications-add-staff-role.sql
--
-- Idempotent. No-ops on a fresh setup (columns/constraints already
-- defined in the CREATE TABLE above).
-- ============================================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_role_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_recipient_role_check
  CHECK (recipient_role IN ('Admin', 'Staff', 'Technician'));


-- ============================================================
-- 11. NOTIFICATION DB TRIGGERS
-- Source: notifications-trigger.sql
--
-- SECURITY DEFINER trigger functions run as postgres (bypasses RLS)
-- so the anon client never needs INSERT access on notifications.
--
-- Covers:
--   - New ticket submitted → Staff notification
--   - Status changed (forward)  → fixed role mapping
--   - Status reverted (undo)    → inferred from reverted-to status
-- ============================================================

CREATE OR REPLACE FUNCTION fn_notify_on_ticket_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT;
BEGIN
  v_label := NEW.client_name || '''s ' || NEW.unit_brand || ' ' || NEW.unit_model;

  INSERT INTO notifications (recipient_role, message, type, status, ticket_uuid, ticket_human_id)
  VALUES ('Staff', 'New ticket: ' || v_label, 'new_ticket', 'Pending', NEW.id, NEW.ticket_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_ticket_insert ON tickets;
CREATE TRIGGER trg_notify_on_ticket_insert
  AFTER INSERT ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_on_ticket_insert();

CREATE OR REPLACE FUNCTION fn_notify_on_ticket_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label   TEXT;
  v_role    TEXT;
  v_message TEXT;
  v_is_undo BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_label   := NEW.client_name || '''s ' || NEW.unit_brand || ' ' || NEW.unit_model;
  v_is_undo := (NEW.previous_status IS NULL AND OLD.previous_status IS NOT NULL);

  IF v_is_undo THEN
    v_message := 'Reverted to ' || NEW.status || ': ' || v_label;
    CASE NEW.status
      WHEN 'Pending'            THEN v_role := 'Technician';
      WHEN 'Inspection & Quote' THEN v_role := 'Staff';
      WHEN 'Repair in Progress' THEN v_role := 'Staff';
      WHEN 'Done'               THEN v_role := 'Technician';
      ELSE                           v_role := 'Staff';
    END CASE;
  ELSE
    CASE NEW.status
      WHEN 'Inspection & Quote' THEN
        v_role    := 'Technician';
        v_message := 'Inspection & Quote: ' || v_label;
      WHEN 'Repair in Progress' THEN
        v_role    := 'Staff';
        v_message := 'Repair in Progress: ' || v_label;
      WHEN 'Done' THEN
        v_role    := 'Staff';
        v_message := 'Done: ' || v_label;
      WHEN 'Paid' THEN
        v_role    := 'Staff';
        v_message := 'Paid: ' || v_label;
      WHEN 'Denied' THEN
        RETURN NEW;
      ELSE
        v_role    := 'Staff';
        v_message := NEW.status || ': ' || v_label;
    END CASE;
  END IF;

  INSERT INTO notifications (recipient_role, message, type, status, ticket_uuid, ticket_human_id)
  VALUES (v_role, v_message, 'status_change', NEW.status, NEW.id, NEW.ticket_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_ticket_status_change ON tickets;
CREATE TRIGGER trg_notify_on_ticket_status_change
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_notify_on_ticket_status_change();


-- ============================================================
-- 12. LOCK DOWN NOTIFICATIONS INSERT
-- Source: notifications-lockdown.sql
--
-- The SECURITY DEFINER trigger functions above bypass this
-- restriction, so notifications still get created — just not
-- by the anon client directly.
-- ============================================================

DROP POLICY IF EXISTS "Allow public insert notifications" ON notifications;


-- ============================================================
-- 13. PUSH_SUBSCRIPTIONS TABLE + RLS
-- Source: push-setup.sql
-- ============================================================

CREATE TABLE push_subscriptions (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  endpoint     TEXT        NOT NULL UNIQUE,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  role         TEXT        CHECK (role IN ('Admin', 'Technician')),
  user_agent   TEXT,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_active
  ON push_subscriptions (active);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read push_subscriptions"
  ON push_subscriptions FOR SELECT
  USING (true);

-- INSERT / UPDATE / DELETE intentionally omitted — handled by the
-- manage-push Edge Function (section 14).


-- ============================================================
-- 14. LOCK DOWN PUSH_SUBSCRIPTIONS WRITES
-- Source: push-lockdown.sql
--
-- All writes go through the manage-push Edge Function (service-role key).
-- Deploy it before running this section:
--   supabase functions deploy manage-push --no-verify-jwt
-- ============================================================

DROP POLICY IF EXISTS "Allow public insert push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow public update push_subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow public delete push_subscriptions" ON push_subscriptions;


-- ============================================================
-- Done!
--
-- Required Edge Functions (deploy with --no-verify-jwt):
--   verify-login    supabase secrets set ADMIN_PASSWORD / STAFF_PASSWORD / TECH_PASSWORD
--   staff-login     (no extra secrets)
--   staff-manage    (no extra secrets)
--   change-password (no extra secrets)
--   admin-delete    (no extra secrets — reuses ADMIN_PASSWORD)
--   send-push       supabase secrets set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
--   manage-push     (no extra secrets beyond auto-injected SUPABASE_SERVICE_ROLE_KEY)
-- ============================================================
