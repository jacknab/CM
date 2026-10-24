-- 0260_shop_prices.sql
--
-- Hardware shop prices set on the /isAdmin Hardware Prices page (owner, 2026-10-24). A product with no row here
-- sells at its price in shared/shopCatalog.ts. Checkout, the cart and certxa.com/products all use these.
-- Also: orders are now paid on certxa.com itself (a Stripe PaymentIntent), so look orders up by it.
CREATE TABLE IF NOT EXISTS shop_prices (
  sku         TEXT PRIMARY KEY,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_by  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_payment_intent_idx ON shop_orders (payment_intent_id) WHERE payment_intent_id IS NOT NULL;
