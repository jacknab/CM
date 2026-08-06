-- Add unique constraint on support_agents.email if not already present.
-- Without this, the ON CONFLICT (email) clause in the agent seed fails
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" on VPS installs where the table was created without the
-- constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_agents'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'support_agents'
      AND c.contype = 'u'
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum = c.conkey[1]
          AND a.attname = 'email'
      )
  ) THEN
    -- Remove any duplicate emails first (keep the row with the highest id)
    DELETE FROM support_agents
    WHERE id NOT IN (
      SELECT MAX(id) FROM support_agents GROUP BY email
    );
    ALTER TABLE support_agents ADD CONSTRAINT support_agents_email_unique UNIQUE (email);
  END IF;
END
$$;
