-- Solo API allow-list, report-only first (owner, 2026-11-06; plans/solo-web-dashboard.md step 3).
-- Each server address a Solo account (Certxa Pro app account, or a store on the Solo / Plus plan) called that is not on
-- its allow-list (lib/soloApiAllowList.ts), counted per method + address shape + where it came from (app or web).
-- Read it before switching the lock from "report" to "enforce".

CREATE TABLE IF NOT EXISTS solo_api_report (
  method      text NOT NULL,
  path        text NOT NULL,
  source      text NOT NULL,
  hits        integer NOT NULL DEFAULT 0,
  stores      integer[] NOT NULL DEFAULT '{}',
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (method, path, source)
);
