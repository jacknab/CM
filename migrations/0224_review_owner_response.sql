-- The reply a business owner posts under a client review (Certxa internal reviews).
--
-- NOTE for this file: the startup migration runner splits on semicolons and does not understand
-- comments, so comments here must never contain a semicolon or an apostrophe.
--
--   reviews.owner_response      the text of the reply, NULL when there is none
--   reviews.owner_response_at   when the reply was last saved
--
-- The review itself (rating, comment) is never changed by replying.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS owner_response text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS owner_response_at timestamp;
