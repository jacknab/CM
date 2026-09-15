# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

## 2026-09-15 — `SalonCard`'s "Open now" badge is never actually true

**File:** `artifacts/marketplace/src/App.tsx` — `SalonCard` component, `{salon.isOpen ? 'Open now' : 'By appointment'}`
**Found while:** adding a "Nearby salons" section to the salon profile page and checking whether `Salon.isOpen` (used by `SalonCard`'s status badge) is ever actually populated from real hours data before reusing the component.
**Issue:** `isOpen?: boolean` is declared on the `Salon` type (both `lib/api.ts` and `salonApi.ts`) but no API response ever sets it — `toApiSalon()` never includes an `isOpen` field. So every `SalonCard` renders "By appointment" unconditionally, regardless of the salon's real hours or the current time. Not a false claim (it's a static fallback, not a fabricated "Open now"), but it's dead/misleading UI — the badge implies live status that doesn't exist.
**Why not fixed now:** `SalonCard` wasn't part of the nearby-salons change (swapped to `FeaturedMarketplaceCard` instead, which has no such badge). Fixing it properly means computing real open/closed state from `salon.hours` + current time server-side or client-side, which is a small but distinct feature, not a one-line fix.

---

## 2026-09-14 — `timezone.test.ts` — missing test-runner type definitions

**Files:** `artifacts/api-server/src/__tests__/timezone.test.ts` (throughout — `describe`, `test`, `expect` all unresolved)
**Found while:** running `tsc --noEmit` across the whole api-server package to verify the salon-directory rewrite (`routes/salonDirectory.ts`) introduced no type errors — this file is unrelated.
**Error (`tsc --noEmit`):**
```
src/__tests__/timezone.test.ts(27,1): error TS2593: Cannot find name 'describe'. Do you need to install type definitions for a test runner? ...
src/__tests__/timezone.test.ts(33,5): error TS2304: Cannot find name 'expect'.
(repeats throughout the file for describe/test/expect)
```
**Context:** The project uses vitest (`"test": "vitest run"` in package.json), but `tsconfig.json`'s `types` field doesn't include vitest's globals (or the file isn't picking up `vitest/globals`), so a plain `tsc --noEmit` run treats `describe`/`test`/`expect` as undefined identifiers. `vitest run` itself likely still passes since vitest provides its own type-aware runtime, but any CI step that runs bare `tsc --noEmit` over the whole project would fail on this file.
**Not fixed because:** unrelated to the salon-directory task in progress; the fix (adding `"types": ["vitest/globals"]` to tsconfig, or importing from `"vitest"` explicitly in the test file) touches shared tsconfig/test infra that deserves its own verification pass rather than a drive-by edit.

---

## 2026-09-12 — `storage.ts` — `sql.identifier()` called with an array instead of a string

**Files:** `artifacts/api-server/src/storage.ts:578`, `:587`
**Found while:** implementing the client visit-notes / AI profile note feature (unrelated file).
**Error (`tsc --noEmit`):**
```
src/storage.ts(578,61): error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'string'.
src/storage.ts(587,56): error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'string'.
```
**Context:** Inside a staff-deletion transaction, two loops build a dynamic table name and call `sql.identifier([table])`:
```ts
await tx.execute(sql`DELETE FROM ${sql.identifier([table])} WHERE staff_id = ${id}`);
...
await tx.execute(sql`UPDATE ${sql.identifier([table])} SET staff_id = NULL WHERE staff_id = ${id}`);
```
The installed drizzle-orm version's `sql.identifier()` type signature wants a single `string`, not `string[]`. Likely fix is `sql.identifier(table)` (drop the array wrapper) — but verify against the actual installed drizzle-orm version's signature before changing, since array form is valid in some versions (for multi-part/schema-qualified identifiers).
**Not fixed because:** unrelated to the task in progress, and touches a staff-deletion code path that deserves its own careful look rather than a drive-by edit.

---

## 2026-09-12 — `dead-seats.ts` — `totalDeadSlotCount` missing from `DeadSeatReport` type

**File:** `artifacts/api-server/src/intelligence/dead-seats.ts:168`
**Found while:** same session as above (unrelated file).
**Error (`tsc --noEmit`):**
```
src/intelligence/dead-seats.ts(168,5): error TS2353: Object literal may only specify known properties, and 'totalDeadSlotCount' does not exist in type 'DeadSeatReport'.
```
**Context:** The function's return object sets a `totalDeadSlotCount` field (with a comment explaining it's the full count before the `deadSlots` array is truncated to the top 20), but the `DeadSeatReport` type/interface this function returns doesn't declare that field yet. Likely fix: add `totalDeadSlotCount: number;` to the `DeadSeatReport` type definition.
**Not fixed because:** unrelated to the task in progress; this file already had other uncommitted changes in progress when this session started, so a drive-by fix risked colliding with that work.
