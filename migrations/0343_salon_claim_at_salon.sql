-- Claiming a prepared salon page online, at the salon (owner, 2026-11-11; lib/salonClaim.ts claimLinkAtSalon): the
-- owner opens certxa.com/claim/salon/<slug>, shares their location, and when they are at the salon gets a claim link
-- whose next step is the call to the salon's phone with a code. source says how a link started ('tom' or 'at_salon');
-- located_m is how far from the salon the device said it was (no coordinates are kept).
ALTER TABLE salon_claim_links ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tom';
ALTER TABLE salon_claim_links ADD COLUMN IF NOT EXISTS located_m integer;
