-- PROPOSED rev 2 (Last Cut Formula Engine) - NOT APPLIED. Renumber at implementation. Requires 0353.
-- Certxa's global hairstyle categories. Re-runnable: existing slugs are left alone.
INSERT INTO hairstyle_categories (slug, name, display_order) VALUES
  ('fades-and-tapers', 'Fades and Tapers', 10),
  ('buzz-cuts-and-military', 'Buzz Cuts and Military', 20),
  ('classic-and-professional', 'Classic and Professional', 30),
  ('crops-and-fringe', 'Crops and Fringe', 40),
  ('pompadours-and-undercuts', 'Pompadours and Undercuts', 50),
  ('curly-and-textured', 'Curly and Textured', 60),
  ('afros-waves-twists-and-locs', 'Afros, Waves, Twists and Locs', 70),
  ('mohawks-mullets-and-alternative', 'Mohawks, Mullets and Alternative Cuts', 80),
  ('medium-and-long', 'Medium and Long Hairstyles', 90),
  ('childrens', 'Children''s Hairstyles', 100),
  ('specialty-and-custom', 'Specialty and Custom Styles', 110)
ON CONFLICT (slug) DO NOTHING;
