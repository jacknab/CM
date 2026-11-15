-- Certxa Pro (owner, 2026-11-15: "match GlossGenius"): business expenses with receipt photos and monthly repeats,
-- and a low-stock alert to the pro when a product sells down to its low-stock level (lib/proExpenses.ts).
CREATE TABLE IF NOT EXISTS business_expenses (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  spent_on DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category TEXT NOT NULL,
  vendor TEXT,
  note TEXT,
  receipt_url TEXT,
  repeats_monthly BOOLEAN NOT NULL DEFAULT false,
  repeated_from INTEGER,                                   -- the expense this month's copy was made from
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_business_expenses_store ON business_expenses (store_id, spent_on);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_expenses_repeat ON business_expenses (repeated_from, spent_on) WHERE repeated_from IS NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_alerted BOOLEAN NOT NULL DEFAULT false;
