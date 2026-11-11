-- Marel's follow-up text (owner, 2026-11-11): after she does something on a call (a reset e-mail, a retried payment), she
-- can offer a short check-in text a little later; only with the caller's yes on the call. One per call.
CREATE TABLE IF NOT EXISTS agent_follow_ups (
  id           serial PRIMARY KEY,
  call_sid     text NOT NULL UNIQUE,
  phone_e164   text NOT NULL,
  store_id     integer REFERENCES locations(id) ON DELETE SET NULL,
  body         text NOT NULL,
  send_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'pending',   -- pending | sending | sent | failed
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_follow_ups_due ON agent_follow_ups (send_at) WHERE status = 'pending';
