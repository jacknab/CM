---
name: Staff table password column removal
description: The staff table no longer has a password column — all code references must be cleaned up after any schema refactor that removes it
---

## What happened
The `password` column was removed from the `staff` table as part of a staff structure refactor. Staff members now authenticate exclusively via OTP (no password-based login for staff). Passwords for the associated `users` record (owner login) are still on the `users` table.

## Locations that broke (now fixed)
Any refactor of the staff schema that removes `password` must clean up these patterns:

1. **Staff list/get routes** — `staffList.map(({ password, ...safe }) => safe)` → just return the object directly; there's nothing to strip
2. **Staff create route** — dead code block `if (input.password) { bcrypt.hash(...) } else { delete input.password }` — remove entirely
3. **Staff update route** — same dead code block
4. **Invite acceptance flow** — `db.update(staff).set({ password: hashedPw, ... })` — remove `password` from the SET; the password belongs to the newly created `users` row, not the staff row
5. **Public store staff endpoint** — `storeStaff.map(({ email, phone, password, ...rest }) => rest)` — remove `password` from destructure
6. **Booking confirmation lookup** — `const { password: _pw, ...staffSafe } = apt.staff` — remove
7. **Staff `/me` profile GET/PUT** — same stale destructure pattern
8. **auth.ts `/api/auth/me`** — `const { password: _pw, ...safeStaff } = staffMember` — remove
9. **Schema-drift check list** — remove `"password"` from the staff columns list in the drift check

## Key rule
`users.password` is still valid (owners log in with email+password). `staff.password` no longer exists. Any `as any` cast that destructures `.password` off a staff object is stale and must be removed.

**Why:** Staff use OTP-only login; storing passwords on the staff table was redundant and insecure.

**How to apply:** After any staff schema refactor, run `grep -n "password" artifacts/api-server/src/routes.ts artifacts/api-server/src/auth.ts` and audit every match against whether the context is `staff` or `users`.
