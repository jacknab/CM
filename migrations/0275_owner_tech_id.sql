-- Every salon owner gets a Tech ID (owner, 2026-10-31). Tech IDs belong to staff records (staff.barber_number,
-- given out by nailTickets.ensureBarberNumbers). The owner's staff record is the one with employment_type
-- 'owner'. How a salon gets one (the same order as nailTickets.ensureOwnerStaff):
--   1. the staff record the owner's login is linked to (users.staff_id) is already theirs: nothing to do,
--   2. else the record sign-up made for them (named "Owner") or one with the owner's own name is marked owner,
--      and keeps working exactly as before (calendar, bookings, turns),
--   3. else a new record: role "Owner", hidden from the calendar and the booking page, not in the turn line.
-- (No semicolons inside strings here: the migration runner splits on them.)

-- At most one active owner record per salon.
CREATE UNIQUE INDEX IF NOT EXISTS staff_one_owner_per_store ON staff (store_id)
  WHERE employment_type = 'owner' AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated');

-- 2. Mark the sign-up "Owner" record, or one with the owner's name (the lowest id when several match).
UPDATE staff s SET employment_type = 'owner'
  FROM (
    SELECT DISTINCT ON (l.id) l.id AS store_id, st.id AS staff_id
      FROM locations l
      JOIN users u ON u.id = l.user_id
      JOIN staff st ON st.store_id = l.id AND COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated')
     WHERE (lower(trim(st.name)) = 'owner' OR lower(trim(st.name)) = lower(trim(CONCAT_WS(' ', u.first_name, u.last_name))))
       AND NOT EXISTS (SELECT 1 FROM staff x WHERE x.store_id = l.id AND COALESCE(x.status, 'active') NOT IN ('removed', 'deactivated')
                         AND (x.employment_type = 'owner' OR x.id = u.staff_id))
     ORDER BY l.id, st.id
  ) pick
 WHERE s.id = pick.staff_id;

-- 3. Everyone else: a new owner record.
INSERT INTO staff (name, role, store_id, status, employment_type, show_on_calendar, takes_turns, front_desk, commission_enabled)
SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Owner'), 'Owner', l.id, 'active', 'owner', false, false, false, false
  FROM locations l
  JOIN users u ON u.id = l.user_id
 WHERE NOT EXISTS (
         SELECT 1 FROM staff s
          WHERE s.store_id = l.id
            AND COALESCE(s.status, 'active') NOT IN ('removed', 'deactivated')
            AND (s.employment_type = 'owner' OR s.id = u.staff_id)
       )
ON CONFLICT DO NOTHING
