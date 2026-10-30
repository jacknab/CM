-- E-mail audit fixes (owner, 2026-10-30).

-- 1. A salon on trial got the same message twice from two systems: the trial reminders
--    (services/trial-reminders.ts: 10 / 7 / 3 / 1 days left, then "trial has ended") and three lifecycle
--    campaigns saying the same thing ("One week left", "Your trial ends tomorrow", "Your account is paused").
--    The trial reminders stay; the three campaigns are paused. They can be turned back on in the admin's
--    platform e-mail campaigns.
UPDATE platform_email_campaigns SET status = 'paused', updated_at = now()
 WHERE campaign_key IN ('trial-expiring-7', 'trial-expiring-1', 'trial-expired-reactivation') AND status = 'active';

-- 2. The client's day-before reminder e-mail runs every 5 minutes over a 1-hour window and had no record of
--    being sent, so one appointment could get up to 12 reminders. It is now claimed once (mail.ts).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_email_sent_at timestamptz;
