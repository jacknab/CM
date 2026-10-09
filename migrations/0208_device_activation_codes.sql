-- Device pairing (activation) codes: lets whoever sets up a POS, /frontdesk, or self-serve
-- kiosk tablet enter one 12-digit number instead of typing/seeing the store's real slug and
-- register id. The same code works for any of those roles — which one it pairs as depends on
-- which app screen it's entered into, not the code itself. Codes are generated lazily on first
-- read (see lib/activationCodes.ts) — this migration only adds the columns and their partial
-- unique indexes (partial so many NULLs are allowed before a row's code is first generated).

ALTER TABLE locations ADD COLUMN IF NOT EXISTS activation_code text;
ALTER TABLE registers ADD COLUMN IF NOT EXISTS activation_code text;

CREATE UNIQUE INDEX IF NOT EXISTS locations_activation_code_unique
  ON locations (activation_code) WHERE activation_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS registers_activation_code_unique
  ON registers (activation_code) WHERE activation_code IS NOT NULL;
