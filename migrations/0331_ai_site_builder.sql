-- AI Website Builder (owner, 2026-11-09; plans/ai-website-builder.md), stage 0–2.

-- AI credits: separate from text-message credits. 200 free per account, granted once (free_granted_at).
CREATE TABLE IF NOT EXISTS ai_credit_accounts (
  store_id        integer PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
  balance         integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  free_granted_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Every change to a balance. charge_key makes a charge happen once even if a request is retried.
CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id            serial PRIMARY KEY,
  store_id      integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  change        integer NOT NULL,
  reason        text NOT NULL,
  charge_key    text UNIQUE,
  balance_after integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_credit_ledger_store_idx ON ai_credit_ledger (store_id, created_at DESC);

-- Each AI call: what it was for, which provider/model, tokens, and whether it worked (for cost tracking in /isAdmin).
CREATE TABLE IF NOT EXISTS ai_site_runs (
  id            serial PRIMARY KEY,
  store_id      integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  provider      text NOT NULL,
  model         text NOT NULL,
  input_tokens  integer,
  output_tokens integer,
  credits       integer NOT NULL DEFAULT 0,
  ok            boolean NOT NULL,
  error         text,
  ms            integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_site_runs_store_idx ON ai_site_runs (store_id, created_at DESC);

-- A round of 6 ideas: the facts it was made from and the ideas themselves (validated JSON specs).
CREATE TABLE IF NOT EXISTS ai_site_idea_rounds (
  id         serial PRIMARY KEY,
  store_id   integer NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  facts      jsonb NOT NULL,
  ideas      jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_site_idea_rounds_store_idx ON ai_site_idea_rounds (store_id, created_at DESC);

-- Love it / Not this, a note and chips (colours, letters, layout, words) per idea.
CREATE TABLE IF NOT EXISTS ai_site_feedback (
  round_id   integer NOT NULL REFERENCES ai_site_idea_rounds(id) ON DELETE CASCADE,
  idea_index integer NOT NULL CHECK (idea_index BETWEEN 0 AND 11),
  verdict    text CHECK (verdict IN ('love', 'not')),
  note       text,
  chips      text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, idea_index)
);
