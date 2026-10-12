-- Hardware shop orders placed on certxa.com/products.
-- One row per checkout; the admin Fulfillment page works from the paid ones.
CREATE TABLE IF NOT EXISTS shop_orders (
  id                  SERIAL PRIMARY KEY,
  order_number        TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending_payment',  -- pending_payment | paid | shipped | cancelled
  customer_name       TEXT NOT NULL,
  customer_email      TEXT NOT NULL,
  customer_phone      TEXT,
  address_line1       TEXT NOT NULL,
  address_line2       TEXT,
  city                TEXT NOT NULL,
  state               TEXT NOT NULL,
  zip                 TEXT NOT NULL,
  items               JSONB NOT NULL,                           -- [{sku,name,qty,unitCents}]
  subtotal_cents      INTEGER NOT NULL,
  shipping_cents      INTEGER NOT NULL,
  total_cents         INTEGER NOT NULL,
  shipping_service    TEXT NOT NULL,
  checkout_session_id TEXT UNIQUE,
  payment_intent_id   TEXT,
  tracking_number     TEXT,
  serial_numbers      TEXT,
  paid_at             TIMESTAMP,
  shipped_at          TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_status_idx ON shop_orders (status, created_at);
