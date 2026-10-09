-- Two additions to the idempotency record (both nullable, nothing existing changes):
--   request_hash  what the request said, so a key that is reused for DIFFERENT contents is refused rather than
--                 answered with someone else's result.
--   entity_id     the record the request created, written in the same transaction that creates it. If the
--                 server dies after creating it but before storing its answer, the retry finds this and
--                 answers from the existing record instead of creating a second one.
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS entity_id integer;
