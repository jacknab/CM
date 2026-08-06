-- Drop legacy training/LMS tables (feature retired)
-- CASCADE removes dependent indexes/constraints automatically.

DROP TABLE IF EXISTS training_events CASCADE;
DROP TABLE IF EXISTS training_user_state CASCADE;
DROP TABLE IF EXISTS training_action_steps CASCADE;
DROP TABLE IF EXISTS training_action_categories CASCADE;
DROP TABLE IF EXISTS training_user_profile CASCADE;
DROP TABLE IF EXISTS training_settings CASCADE;

-- Defensive cleanup for historical sequence-name variants.
DROP SEQUENCE IF EXISTS training_action_categories_id_seq;
DROP SEQUENCE IF EXISTS training_action_categories_id_seq1;
DROP SEQUENCE IF EXISTS training_action_steps_id_seq;
DROP SEQUENCE IF EXISTS training_action_steps_id_seq1;
DROP SEQUENCE IF EXISTS training_user_state_id_seq;
DROP SEQUENCE IF EXISTS training_events_id_seq;

