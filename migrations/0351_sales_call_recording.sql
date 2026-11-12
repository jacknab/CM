-- Tom and Marel's calls are recorded (owner, 2026-11-12): the recording's Twilio id, so isTeam › Sales Leads can play
-- it. The audio itself is downloaded to the server and deleted at Twilio (lib/callRecordingArchive.ts).
ALTER TABLE sales_call_logs ADD COLUMN IF NOT EXISTS recording_sid text;
