-- Tom's ownership call-back (owner, 2026-11-10): one automatic retry two minutes later when the first call reaches
-- voicemail, isn't answered, is busy or fails.
ALTER TABLE salon_claim_callbacks ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;
