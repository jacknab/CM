-- 0257_staff_employment.sql
--
-- Staff details → Payroll & Tax tab (owner, 2026-10-24): each staff member's legal name (printed on their paychecks),
-- start and end dates, worker type (W-2 employee or 1099 contractor) and tax paperwork — W-4 for employees, W-9 for
-- contractors, I-9 employment eligibility for employees. The mailing address printed on checks stays in the existing
-- staff.mailing_* columns.
--
-- Kept out of the staff table on purpose: staff rows are read all over the app, these are not. The Social Security /
-- tax ID number and the I-9 document number are stored only encrypted (AES-256-GCM, key STAFF_TAX_ENCRYPTION_KEY),
-- with their last 4 digits beside them for display.

CREATE TABLE IF NOT EXISTS staff_employment (
  staff_id                 INTEGER PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  store_id                 INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  legal_name               TEXT,
  start_date               DATE,
  end_date                 DATE,
  worker_type              TEXT,                 -- 'w2' | '1099'
  tax_id_type              TEXT,                 -- 'ssn' | 'ein'
  tax_id_enc               TEXT,
  tax_id_last4             TEXT,
  -- W-4 (employees)
  w4_filing_status         TEXT,                 -- 'single' | 'married_joint' | 'head_of_household'
  w4_multiple_jobs         BOOLEAN NOT NULL DEFAULT FALSE,
  w4_dependents_amount     NUMERIC(10,2),
  w4_other_income          NUMERIC(10,2),
  w4_deductions            NUMERIC(10,2),
  w4_extra_withholding     NUMERIC(10,2),
  w4_exempt                BOOLEAN NOT NULL DEFAULT FALSE,
  w4_signed_date           DATE,
  -- W-9 (contractors)
  w9_business_name         TEXT,
  w9_tax_classification    TEXT,                 -- 'individual' | 'c_corp' | 's_corp' | 'partnership' | 'trust' | 'llc_c' | 'llc_s' | 'llc_p' | 'other'
  w9_signed_date           DATE,
  -- I-9 (employees)
  i9_citizenship_status    TEXT,                 -- 'citizen' | 'noncitizen_national' | 'permanent_resident' | 'authorized_alien'
  i9_work_auth_expires     DATE,
  i9_document_title        TEXT,
  i9_document_number_enc   TEXT,
  i9_document_last4        TEXT,
  i9_document_expires      DATE,
  i9_verified_date         DATE,
  i9_verified_by           TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id       TEXT
);

CREATE INDEX IF NOT EXISTS staff_employment_store_idx ON staff_employment (store_id);
