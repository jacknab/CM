-- Tax category rule columns on locations
-- Default: services/addons/gift-cards exempt, retail products taxable
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_services_taxable  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_addons_taxable     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_products_taxable   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS tax_gift_cards_taxable BOOLEAN NOT NULL DEFAULT FALSE;
