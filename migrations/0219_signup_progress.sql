-- Signup progress. Where each new owner is in the onboarding conversation, kept on the server so
-- the support team can see whether a signup finished and, if not, which step it stopped at.
-- Before this the steps were only remembered in the browser the owner was using.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   flow                 chat (the conversational onboarding) or classic (the older wizard)
--   current_step_id      the step the owner is on now, an id from booking/src/lib/onboarding-script.ts
--   completed_step_ids   the steps already answered, in order
--   progress_pct         the same percentage the owner sees on the progress bar
--   last_activity_at     the last time the owner moved between steps
--   completed_at         when the owner pressed Complete Setup on the review step. NULL means the
--                        signup has not finished, even if a store already exists.

CREATE TABLE IF NOT EXISTS signup_progress (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  flow text NOT NULL DEFAULT 'chat',
  current_step_id text NOT NULL DEFAULT '',
  completed_step_ids jsonb NOT NULL DEFAULT '[]',
  progress_pct integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS signup_progress_unfinished ON signup_progress (last_activity_at) WHERE completed_at IS NULL;
