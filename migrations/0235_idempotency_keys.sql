-- Durable record of requests that carry an X-Idempotency-Key, so a device replaying its offline queue
-- (after a lost reply, an app restart or a server restart) gets the first answer back instead of making
-- the same client, check-in or ticket a second time. Until now these keys lived only in server memory and
-- were forgotten on every restart.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  store_id    integer     NOT NULL,
  key         text        NOT NULL,
  scope       text        NOT NULL,           -- which route made it, e.g. 'nail.ticket.create'
  state       text        NOT NULL,           -- 'in_progress' | 'done'
  status      integer,                        -- HTTP status of the stored answer
  response    jsonb,                          -- the stored answer
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, key)
);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx ON idempotency_keys (created_at);
