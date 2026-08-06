---
name: Staff Mobile OTP Auth shape mismatch
description: The OTP login endpoint returns a different shape than StaffUser expects — key mapping rules and session persistence pattern.
---

## The mismatch

`POST /api/auth/staff-otp-login` (and `GET /api/auth/user` for staff sessions) return:
```json
{
  "id": "staff-5",        // string — NOT the numeric DB id
  "staffId": 5,           // number — the real staff table row id
  "firstName": "Jane",
  "lastName": "Doe",
  "profileImageUrl": "...",
  ...
}
```

`StaffUser` (mobile `lib/api.ts`) expects:
```ts
{ id: number, name: string | null, avatarUrl: string | null, ... }
```

## Fix

`normalizeStaffUser(raw)` in `lib/api.ts` maps the server payload → `StaffUser`:
- `staffId` (positive number) → `id`; falls back to parsing `"staff-N"` string
- Throws if no valid positive numeric id can be extracted (prevents NaN/0 stored as user)
- `firstName + lastName` → `name`
- `profileImageUrl` → `avatarUrl`

Always call `normalizeStaffUser()` before `setUser()` after any auth endpoint response.

## Session persistence

`AuthContext.setUser` now calls `saveUser()` (AsyncStorage) automatically on every set.  
On app restart `getStoredUser()` restores the user without re-login.

## Biometric session check

Biometric resume uses `GET /api/auth/user` — NOT `/api/auth/me` (that endpoint does not exist).  
Pre-check id shape with `staffId > 0` or `id` matching `/^staff-\d+$/` before calling normalizeStaffUser.  
On failure: clear biometric credentials + show "Session Expired" alert.

**Why:** The original code used `setUser(result as any)` which stored `id: "staff-5"` (string) as `StaffUser.id`. Downstream `user.id` references (schedule staffId filter, timeclock) resolved to `"staff-5"` instead of `5`, silently breaking queries.
