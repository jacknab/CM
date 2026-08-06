# Certxa — Development Changelog

This file tracks significant investigations, bug fixes, and changes made during development sessions.

---

## 2026-08-02 — GitHub Sync + Google Reviews Auto-Reply Fix

### GitHub Pull
- Pulled latest code from `jacknab/certxa-clean` (GitHub), resetting local workspace to commit `76249315`
- 2,374 files updated

### Missing Packages Installed
After pulling, the following npm packages were missing and installed into `@workspace/booking`:
- `@stripe/connect-js`
- `@stripe/react-connect-js`
- `@stripe/stripe-js`
- `html5-qrcode`

### Missing DB Tables Created
Migration `migrations/0143_website_builder_tables.sql` was created and applied.
These tables were new in the pulled code but not yet in the Replit database:
- `wb_templates` — website builder template registry
- `wb_websites` — website builder published sites
- `wb_page_views` — visitor analytics per website
- `wb_purchased_subdomains` — purchased subdomains tracking
- `wb_image_library` — image library for website builder

---

## 2026-08-02 — Google Reviews Auto-Reply Bug Fix (Critical)

### Problem
The Google Reviews auto-reply feature had **never successfully posted a single reply** since it was built. Every attempt resulted in HTTP 404 errors from Google. The UI showed two types of 404:

1. `HTTP 404: review not found on Google — may have been deleted by the reviewer`
2. `HTTP 404: <!DOCTYPE html> <html lang=en>...Error 404 (Not Found)!!</title>` — an **HTML page** from Google, not a JSON API error

### Root Cause
The Google Business Profile Reviews API (`mybusinessreviews.googleapis.com/v1`) requires the **full review resource name** in the URL, including the `accounts/{accountId}/` prefix:

```
PUT https://mybusinessreviews.googleapis.com/v1/accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
```

Both the auto-reply dispatcher and the `replyToReview` method had a line that stripped the `accounts/{id}/` segment before building the URL, leaving:

```
PUT https://mybusinessreviews.googleapis.com/v1/locations/{locationId}/reviews/{reviewId}/reply
```

This URL matches **no valid API route** on Google's servers. Google responded with an HTML 404 error page (not a JSON API error), which is characteristic of a completely wrong URL, not a "review not found" error.

The comment in the code even stated this was intentional — it was not; it was a misunderstanding of the API's URL format.

### Files Fixed
**`artifacts/api-server/src/services/google-review-engine.ts`** (auto-reply dispatcher)
- Removed: `const strippedResourceName = reviewResourceName.replace(/^accounts\/[^/]+\//, "");`
- Changed: reply URL now uses `reviewResourceName` directly (full path, no stripping)

**`artifacts/api-server/src/google-business-api.ts`** (`replyToReview` method)
- Removed: `.replace(/^accounts\/[^/]+\//, "")` from `normalizedReviewName` construction
- The method now preserves the full resource name as-is when building the reply URL

### Action Required in Production
All queued replies in production that show `Failed` status can now be retried using the **Retry** button in the Google Business section. They will succeed with the corrected URL.

---

## 2026-08-02 — Business Hours Gate Removed (Testing Mode)

### Change
The business hours check in the auto-reply dispatcher was bypassed to allow replies to be sent at any time (for testing purposes).

**File:** `artifacts/api-server/src/services/google-review-engine.ts`

The `isWithinBusinessHours` check in `publishQueuedResponse` was disabled. Previously, if the current time fell outside the store's configured business hours, the dispatcher would reschedule the reply to the next open slot. This prevented testing outside business hours.

> ⚠️ **Note:** This bypass should be reverted to restore business hours gating before going to production, or made configurable via the review engine settings panel.

---

## Earlier Session — Staff Login Calendar Fix

### Problem
After logging in with a staff account, the calendar page showed "No staff members found for this store."

### Root Cause (Two Issues)
1. **`isAuthenticated` middleware** only checked `session.userId`. Staff sessions set `session.staffId` (not `userId`), so every authenticated route returned 401 for staff users — including the staff list API.
2. **`/api/stores/list`** only queried locations by `userId`, returning empty for staff sessions. This meant `StoreProvider` had no store, `selectedStore` was null, and `useStaffList` never fired (it requires a storeId).

### Files Fixed
- `artifacts/api-server/src/auth.ts` — `isAuthenticated` now accepts `userId || staffId`
- `artifacts/api-server/src/routes.ts` — `/api/stores/list` falls back to querying the staff member's `store_id` when no `userId` is in session

---

## Earlier Session — Security Audit

### Issues Fixed
- **`validateStoreOwnership`** was returning a truthy `Response` object instead of `false`, meaning every ownership check silently passed through
- **Admin trial/subscription routes** (`/api/admin/users/:userId/extend-trial`, `/api/admin/users/:userId/set-subscription`) were completely unauthenticated — now gated by `requireAdmin` middleware
- **Intelligence router, Pro-dashboard router, Image library delete** — all now use session-based store resolution instead of trusting request body/query params
- **Google Business review-response routes** — all create/patch/publish/delete operations now verify store ownership

---
