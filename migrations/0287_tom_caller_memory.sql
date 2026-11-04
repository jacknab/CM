-- Tom caller profiles and structured per-call memory. Additive only: preserve
-- every existing lead, transcript, summary, call SID, and call outcome.
-- Before creating canonical-phone uniqueness, refuse ambiguous legacy lead rows
-- rather than merging them automatically.
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS phone_e164 TEXT;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS profile_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS caller_phone_e164 TEXT;
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS structured_summary JSONB;
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS sms_events JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT CASE
        WHEN length(digits) = 10 THEN '+1' || digits
        WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN '+' || digits
        ELSE NULL
      END AS normalized_phone
      FROM (
        SELECT regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS digits
        FROM sales_leads
      ) raw_phones
    ) normalized
    WHERE normalized_phone IS NOT NULL
    GROUP BY normalized_phone
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tom caller-memory migration refused: duplicate sales_leads phone numbers need manual identity review';
  END IF;

  IF EXISTS (
    SELECT call_sid FROM sales_call_logs
    WHERE call_sid IS NOT NULL
    GROUP BY call_sid HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tom caller-memory migration refused: duplicate Twilio call SIDs need manual review';
  END IF;
END $$;

UPDATE sales_leads
SET phone_e164 = CASE
  WHEN length(digits) = 10 THEN '+1' || digits
  WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN '+' || digits
  ELSE NULL
END
FROM (
  SELECT id, regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS digits
  FROM sales_leads
) raw_phones
WHERE sales_leads.id = raw_phones.id
  AND sales_leads.phone_e164 IS NULL
  AND length(raw_phones.digits) IN (10, 11)
  AND (length(raw_phones.digits) = 10 OR left(raw_phones.digits, 1) = '1');

UPDATE sales_call_logs
SET caller_phone_e164 = CASE
  WHEN length(digits) = 10 THEN '+1' || digits
  WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN '+' || digits
  ELSE NULL
END
FROM (
  SELECT id, regexp_replace(COALESCE(caller_phone, ''), '[^0-9]', '', 'g') AS digits
  FROM sales_call_logs
) raw_phones
WHERE sales_call_logs.id = raw_phones.id
  AND sales_call_logs.caller_phone_e164 IS NULL
  AND length(raw_phones.digits) IN (10, 11)
  AND (length(raw_phones.digits) = 10 OR left(raw_phones.digits, 1) = '1');

CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_phone_e164_uidx
  ON sales_leads (phone_e164) WHERE phone_e164 IS NOT NULL;

-- Create a profile for a historical phone caller only if none exists. No
-- caller-provided name or business facts are inferred from a phone number.
INSERT INTO sales_leads (phone, phone_e164, status, source)
SELECT right(caller_phone_e164, 10), caller_phone_e164, 'new', 'phone'
FROM sales_call_logs
WHERE caller_phone_e164 IS NOT NULL
GROUP BY caller_phone_e164
ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO NOTHING;

-- Preserve any existing non-null link. Link only calls whose canonical number
-- identifies exactly one profile after the duplicate guard above.
UPDATE sales_call_logs c
SET lead_id = l.id
FROM sales_leads l
WHERE c.lead_id IS NULL
  AND c.caller_phone_e164 IS NOT NULL
  AND l.phone_e164 = c.caller_phone_e164;

CREATE UNIQUE INDEX IF NOT EXISTS sales_call_logs_call_sid_uidx
  ON sales_call_logs (call_sid) WHERE call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_call_logs_lead_started_idx
  ON sales_call_logs (lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sales_call_logs_caller_phone_e164_idx
  ON sales_call_logs (caller_phone_e164) WHERE caller_phone_e164 IS NOT NULL;
