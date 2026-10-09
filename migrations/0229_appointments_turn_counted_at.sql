-- Turn rotation: when a finished ticket has moved its technician in the line. Makes that move
-- happen once per ticket even when two code paths report the same checkout (card capture + save).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS turn_counted_at timestamptz;
