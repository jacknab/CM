-- Cash price: the percentage off a ticket that is paid entirely in cash (the catalog price is the card
-- price). 0 = off, which is every salon until it sets one.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS cash_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
