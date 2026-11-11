-- Certxa Pro "Card reader & Checkout" settings (owner, 2026-11-11).
-- retail_tax_rate: retail's own sales tax rate; NULL = retail is taxed at sales_tax_rate (as before).
-- client_fee_rate: a fee the client pays on a card payment in the Pro app (0 to 0.03 = 0% to 3%), its own line.
-- appointments.client_fee_amount: that fee on a paid sale. It is part of total_paid, like the tip, and never commissioned.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS retail_tax_rate numeric(5,4);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS client_fee_rate numeric(5,4) NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_fee_amount numeric(10,2);
