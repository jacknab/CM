-- Kiosk Extras (plans/kiosk-builder.md): items a business makes for its check-in kiosk only, like nail shapes —
-- most free, some with a price. They are add-ons underneath, so a client's pick lands on the ticket as an add-on
-- line that the front desk charges at checkout, but they stay off the booking website (hidden_from_public) and
-- out of the staff add-on lists. kiosk_extra_group: extras in one group ("Nail shape") are pick-one at the kiosk.
ALTER TABLE addons ADD COLUMN IF NOT EXISTS kiosk_extra BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE addons ADD COLUMN IF NOT EXISTS kiosk_extra_group TEXT;
CREATE INDEX IF NOT EXISTS addons_kiosk_extras ON addons (store_id) WHERE kiosk_extra;
