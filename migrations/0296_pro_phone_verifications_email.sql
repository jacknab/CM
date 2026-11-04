-- The e-mail typed on the website sign-up next to the mobile number, so isTeam › Sign-ups can still list people
-- who asked for a code and never finished (routes/signupProgress.ts). The app's sign-up step sends none.
ALTER TABLE pro_phone_verifications ADD COLUMN IF NOT EXISTS email TEXT;
