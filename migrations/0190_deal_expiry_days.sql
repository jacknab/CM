-- 0190_deal_expiry_days.sql
--
-- Fixes a real fairness bug: a purchased voucher's redemption deadline was
-- silently tied to the deal's own SALE window (deals.ends_at — when the
-- listing stops being purchasable), not the individual customer's own
-- purchase date. A customer buying on day 1 of a 30-day sale got far less
-- redemption time than one buying on day 29. Vouchers now expire a fixed
-- number of days after their own purchase, owner-picked at deal-creation
-- time from 30/60/90-day presets (see DealForm.tsx) — this column is that
-- N. deals.starts_at/ends_at keep their existing meaning (the sale window)
-- and are unrelated to this.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS expiry_days INTEGER NOT NULL DEFAULT 30;
