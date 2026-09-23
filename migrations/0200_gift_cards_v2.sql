-- 0200_gift_cards_v2.sql
--
-- Gift cards v2: 12-digit numbers (AAAA SSSS BBBB, the middle group is the salon's own store code), a 3-digit PIN, and
-- service / package cards that are single-use. See plans/gift-cards-v2.md.
--
-- Old GC-XXXXXXXX cards are untouched: card_type defaults to 'value' and pin_hash stays NULL (= "legacy": no PIN needed).

-- The salon's identifier inside every card number. Random (not the salon's id), unique, assigned lazily by the API.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS gift_card_store_code CHAR(4);
CREATE UNIQUE INDEX IF NOT EXISTS locations_gift_card_store_code_uidx ON locations (gift_card_store_code) WHERE gift_card_store_code IS NOT NULL;

ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'value';
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id);
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES packages(id);
-- HMAC of number:pin (never the PIN itself). NULL = a legacy card with no PIN.
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP;
-- Service / package cards: set once, when the card pays for its item. Never cleared.
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS used_appointment_id INTEGER REFERENCES appointments(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_cards_type_link_chk') THEN
    ALTER TABLE gift_cards ADD CONSTRAINT gift_cards_type_link_chk CHECK (
      (card_type = 'value'   AND service_id IS NULL     AND package_id IS NULL) OR
      (card_type = 'service' AND service_id IS NOT NULL AND package_id IS NULL) OR
      (card_type = 'package' AND package_id IS NOT NULL AND service_id IS NULL)
    );
  END IF;
END $$;

ALTER TABLE gift_card_transactions ADD COLUMN IF NOT EXISTS service_id INTEGER;
ALTER TABLE gift_card_transactions ADD COLUMN IF NOT EXISTS package_id INTEGER;

-- "Used" is final: once used_at is set it can't be cleared and the card can't be made active again — not by any code path.
CREATE OR REPLACE FUNCTION gift_cards_used_is_final() RETURNS trigger AS $$
BEGIN
  IF OLD.used_at IS NOT NULL AND (NEW.used_at IS DISTINCT FROM OLD.used_at OR NEW.is_active IS TRUE) THEN
    RAISE EXCEPTION 'gift card % has been used and can never be used again', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gift_cards_used_is_final_trg ON gift_cards;
CREATE TRIGGER gift_cards_used_is_final_trg BEFORE UPDATE ON gift_cards FOR EACH ROW EXECUTE FUNCTION gift_cards_used_is_final();
