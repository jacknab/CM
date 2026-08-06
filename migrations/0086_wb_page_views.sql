-- Create wb_page_views table (defined in lib/db/src/schema/websites.ts as
-- pageViewsTable) which was never captured in a SQL migration. Its absence
-- from the live DB caused drizzle-kit push to treat it as an ambiguous
-- "created vs renamed from an existing table" case (comparing its column
-- shape against unrelated tables like incident_postmortems / staff_sms_otps)
-- and hang on an interactive prompt with no TTY attached during deploys.
-- Pre-creating it here (idempotent) means push sees no diff for it at all.
CREATE TABLE IF NOT EXISTS wb_page_views (
  id serial PRIMARY KEY NOT NULL,
  website_id integer NOT NULL REFERENCES wb_websites(id) ON DELETE CASCADE,
  path text DEFAULT '/',
  referrer text,
  ip_hash text,
  ua_snippet text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
