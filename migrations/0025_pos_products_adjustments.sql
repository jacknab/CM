-- Add sales tax rate to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS sales_tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000;

-- Add UPC and purchase price to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS upc TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2);

-- Create manual payout adjustments table
CREATE TABLE IF NOT EXISTS payout_adjustments (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'Manual Adjustment',
  description TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_pay_adj_store_id ON payout_adjustments(store_id);
CREATE INDEX IF NOT EXISTS idx_pay_adj_contractor_id ON payout_adjustments(contractor_id);
