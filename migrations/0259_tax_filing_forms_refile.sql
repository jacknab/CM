-- 0259_tax_filing_forms_refile.sql
--
-- 1099 filing (2026-10-24): fixing a rejected form and refiling it, and checking statuses automatically.
-- A refiled form can end up in a TaxBandits submission of its own, so each form keeps its submission id and the
-- recipient id TaxBandits gave the contractor (needed to update the return). refile_count / last_refiled_at say how
-- often it was sent again; status_checked_at is when its status was last asked for.

ALTER TABLE tax_filing_forms ADD COLUMN IF NOT EXISTS submission_id     TEXT;
ALTER TABLE tax_filing_forms ADD COLUMN IF NOT EXISTS recipient_id      TEXT;
ALTER TABLE tax_filing_forms ADD COLUMN IF NOT EXISTS refile_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tax_filing_forms ADD COLUMN IF NOT EXISTS last_refiled_at   TIMESTAMPTZ;
ALTER TABLE tax_filing_forms ADD COLUMN IF NOT EXISTS status_checked_at TIMESTAMPTZ;

UPDATE tax_filing_forms f SET submission_id = o.submission_id
  FROM tax_filing_orders o WHERE o.id = f.order_id AND f.submission_id IS NULL AND o.submission_id IS NOT NULL;
