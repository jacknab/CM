CREATE TABLE IF NOT EXISTS business_days (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES locations(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  opening_float DECIMAL(10,2),
  expected_cash DECIMAL(10,2),
  counted_cash DECIMAL(10,2),
  cash_sales DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  card_sales DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  tips DECIMAL(10,2) NOT NULL DEFAULT '0.00',
  over_short_amount DECIMAL(10,2),
  denomination_breakdown TEXT,
  opened_at TIMESTAMP,
  opened_by TEXT,
  reconciled_at TIMESTAMP,
  reconciled_by TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_days_store_date_unique ON business_days (store_id, date);

CREATE TABLE IF NOT EXISTS business_day_actions (
  id SERIAL PRIMARY KEY,
  business_day_id INTEGER NOT NULL REFERENCES business_days(id),
  type TEXT NOT NULL,
  amount DECIMAL(10,2),
  reason TEXT,
  performed_by TEXT,
  performed_at TIMESTAMP NOT NULL
);
