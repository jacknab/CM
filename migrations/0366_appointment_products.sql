-- Certxa Pro: retail products sold at checkout (owner, 2026-11-15: "match GlossGenius"). The pro adds products to the
-- visit at checkout; the lines are kept here with the price at the time. When the booking is paid (whatever the payment:
-- card, cash, gift card, payment link), the trigger takes the products out of stock once and sets the booking's
-- product revenue.
CREATE TABLE IF NOT EXISTS appointment_products (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  stock_taken BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_products_appt ON appointment_products (appointment_id);

CREATE OR REPLACE FUNCTION appointment_products_on_paid() RETURNS trigger AS $$
DECLARE total NUMERIC;
BEGIN
  IF NEW.total_paid IS NOT NULL AND OLD.total_paid IS NULL THEN
    SELECT SUM(price_cents * quantity) / 100.0 INTO total FROM appointment_products WHERE appointment_id = NEW.id;
    IF total IS NOT NULL THEN
      UPDATE products p SET stock = GREATEST(0, COALESCE(p.stock, 0) - x.qty)
        FROM (SELECT product_id, SUM(quantity) AS qty FROM appointment_products
               WHERE appointment_id = NEW.id AND NOT stock_taken AND product_id IS NOT NULL GROUP BY product_id) x
       WHERE p.id = x.product_id AND p.store_id = NEW.store_id;
      UPDATE appointment_products SET stock_taken = true WHERE appointment_id = NEW.id;
      IF COALESCE(NEW.product_revenue, 0) = 0 THEN
        UPDATE appointments SET product_revenue = total WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_products_on_paid ON appointments;
CREATE TRIGGER trg_appointment_products_on_paid AFTER UPDATE OF total_paid ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_products_on_paid();
