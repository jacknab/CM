-- Support feed. Posts a platform admin writes on /isadmin for the support team. They are shown,
-- newest first, on the Home page of the support back office at /isTeam. Agents can only read them.
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   author_name   the name of the admin who wrote the post, kept as text so the post still reads
--                 correctly if that admin account is later removed
--   created_at    when the post was published. The feed is ordered by this, newest first.
--                 Editing a post changes updated_at only, so an edit does not move it up.

CREATE TABLE IF NOT EXISTS support_feed_posts (
  id serial PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  author_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_feed_posts_newest ON support_feed_posts (created_at DESC, id DESC);
