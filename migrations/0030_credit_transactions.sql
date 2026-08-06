-- Migration 0030: Platform credit transaction ledger
-- Immutable log of every platform_credits change per store.

CREATE TABLE IF NOT EXISTS "platform_credit_transactions" (
  "id"           SERIAL PRIMARY KEY,
  "store_id"     INTEGER NOT NULL REFERENCES "locations"("id"),
  "type"         TEXT NOT NULL,
  "amount"       NUMERIC(10, 2) NOT NULL,
  "description"  TEXT NOT NULL,
  "balance_after" NUMERIC(10, 2) NOT NULL,
  "reference_id" TEXT,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_pct_store_id_created_at"
  ON "platform_credit_transactions" ("store_id", "created_at" DESC);
