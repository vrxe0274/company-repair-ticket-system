-- ============================================================
-- Migration — Unit condition + discount + client payment plan
-- Adds:
--   tickets.unit_condition            (submit wizard, Unit step)
--   tickets.discount_percent          (manual discount %, capped by the plan)
--   tickets.payment_option            (chosen by client on the tracker page)
--   tickets.payment_partial_high_pct  (full_now discount ceiling, default 40)
--   tickets.payment_partial_low_pct   (half_now discount ceiling, default 20)
--
-- Payment plan → maximum discount:
--   full_now  → pay full price now  → up to payment_partial_high_pct% discount
--   half_now  → pay half price now  → up to payment_partial_low_pct%  discount
--   pay_later → pay on completion   → no discount
--
-- Safe to re-run. Idempotent: columns use IF NOT EXISTS and the payment_option
-- CHECK is dropped/recreated so an earlier version of this migration upgrades
-- cleanly to the new allowed values.
-- ============================================================

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS unit_condition TEXT,
  -- Manual discount percentage, capped by the client's chosen payment plan.
  -- discount_amount remains the resolved peso value (used by PDF / receipt / export).
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_option TEXT,
  ADD COLUMN IF NOT EXISTS payment_partial_high_pct NUMERIC(5,2) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS payment_partial_low_pct  NUMERIC(5,2) DEFAULT 20;

-- Normalize any pre-existing values from the earlier model before re-adding the
-- CHECK. The old deposit-style options no longer map cleanly to the new
-- discount-based plans, so stale values are cleared (clients re-choose on the
-- tracker). Drop the old CHECK first so these updates aren't blocked.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_payment_option_check;
UPDATE tickets
  SET payment_option = NULL
  WHERE payment_option IS NOT NULL
    AND payment_option NOT IN ('full_now', 'half_now', 'pay_later');

-- Allowed payment_option values.
ALTER TABLE tickets ADD CONSTRAINT tickets_payment_option_check
  CHECK (payment_option IS NULL OR payment_option IN ('full_now', 'half_now', 'pay_later'));
