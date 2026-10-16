-- Staff roles per business type and "Takes turns" (shared/staffRoles.ts). takes_turns decides who is in the
-- turn line; everyone keeps taking turns until the owner switches it off (front desk, for instance).
ALTER TABLE staff ADD COLUMN IF NOT EXISTS takes_turns BOOLEAN NOT NULL DEFAULT true;

-- The old built-in role values become the business type's job titles (the same mapping as displayRole()).
UPDATE staff s SET role = CASE
    WHEN l.category ILIKE '%nail%'     THEN 'Nail Technician'
    WHEN l.category ILIKE '%barber%'   THEN 'Barber'
    WHEN l.category ILIKE '%hair%'     THEN 'Stylist'
    WHEN l.category ILIKE '%spa%'      THEN 'Massage Therapist'
    WHEN l.category ILIKE '%esthetic%' THEN 'Esthetician'
    WHEN l.category ~* 'pet|groom'     THEN 'Groomer'
    WHEN l.category ILIKE '%tattoo%'   THEN 'Tattoo Artist'
    ELSE 'Service Provider' END
  FROM locations l
 WHERE l.id = s.store_id
   AND (s.role IS NULL OR btrim(s.role) = '' OR s.role ~* '^(stylist|technician|staff|custom)$');
UPDATE staff SET role = 'Manager'    WHERE role ~* '^manager$';
UPDATE staff SET role = 'Front Desk' WHERE role ~* '^(receptionist|front[ _-]?desk)$';
