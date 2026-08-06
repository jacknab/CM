-- Legacy support_tickets rows from the AI voice workflow used `issue` as
-- required. Back-office and EmailSync inserts do not populate `issue`.
-- Make it nullable when the column exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_tickets'
      AND column_name = 'issue'
  ) THEN
    ALTER TABLE support_tickets ALTER COLUMN issue DROP NOT NULL;
  END IF;
END $$;

