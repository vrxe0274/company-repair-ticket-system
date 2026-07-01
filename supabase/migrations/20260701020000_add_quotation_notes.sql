-- Internal notes attached to a ticket's quotation. Staff/Admin only — never
-- surfaced on the client tracker page or the quotation/receipt PDFs.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS quotation_notes TEXT;
