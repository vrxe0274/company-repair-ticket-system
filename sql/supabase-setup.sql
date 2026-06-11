-- ============================================================
-- VRXE Repair Ticket System — Supabase Setup
-- Follow these steps exactly in order.
-- ============================================================


-- ============================================================
-- STEP 1 — Run this block first (creates the table)
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
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Computed totals
  quotation_amount NUMERIC(10,2),
  final_price NUMERIC(10,2),

  -- Receipt number (auto-generated when marked Paid)
  receipt_number TEXT,

  -- Stamped automatically when status is moved to Paid
  paid_at TIMESTAMPTZ,

  -- Representative who handled the ticket
  representative_name TEXT,

  -- Public tracking (unique token per ticket)
  tracking_token TEXT UNIQUE NOT NULL
);


-- ============================================================
-- STEP 2 — Enable Row Level Security
-- ============================================================

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 3 — Create RLS policies (allow public access)
-- ============================================================

CREATE POLICY "Allow public read"
  ON tickets FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert"
  ON tickets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update"
  ON tickets FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete"
  ON tickets FOR DELETE
  USING (true);


-- ============================================================
-- STEP 4 — Auto-update the updated_at column on every change
-- ============================================================

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


-- ============================================================
-- STEP 5 — Create the storage bucket for repair photos /
--           documentation uploads
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('repair-photos', 'repair-photos', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 6 — Storage bucket policies
-- ============================================================

CREATE POLICY "Allow public uploads to repair-photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'repair-photos');

CREATE POLICY "Allow public read of repair-photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'repair-photos');

CREATE POLICY "Allow public delete of repair-photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'repair-photos');


-- ============================================================
-- Done! Your database is ready.
-- Status workflow: Pending → Inspection & Quote →
--                 Repair in Progress → Done → Paid
--                 (or Denied from Pending)
-- ============================================================
