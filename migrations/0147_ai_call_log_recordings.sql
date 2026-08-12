-- Adds Twilio recording metadata to AI receptionist call logs.
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS recording_sid TEXT;
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS recording_url TEXT;
