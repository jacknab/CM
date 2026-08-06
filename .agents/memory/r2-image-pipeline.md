---
name: R2 image pipeline
description: All image uploads use sharp for WebP conversion; staff avatars also get an 80×80 thumbnail stored separately.
---

## Rule
All image uploads to R2 are auto-converted to WebP (quality 82) before storage.
Staff avatar uploads additionally produce an 80×80 WebP thumbnail.

**Why:** Reduces storage and bandwidth costs; thumbnails enable fast calendar rendering without loading full-size avatars.

**How to apply:**
- Generic uploads: `uploadToR2(buffer, folder, originalName, mimeType)` — converts to WebP, stores as `.webp`
- Avatar uploads: `uploadAvatarToR2(buffer, originalName, mimeType)` — returns `{ avatarUrl, thumbUrl }`, saves both to DB via `storage.updateStaff(id, { avatarUrl, avatarThumbUrl })`
- SVGs are passed through unchanged (sharp cannot rasterize them reliably)
- sharp is in `pnpm-workspace.yaml → onlyBuiltDependencies` so its native binaries build correctly

## Key files
- `artifacts/api-server/src/lib/r2.ts` — `toWebP()`, `toThumb()`, `uploadToR2()`, `uploadAvatarToR2()`
- `shared/schema.ts` — `staff.avatarThumbUrl` column (text)
- DB: `staff.avatar_thumb_url text` column added via ALTER TABLE
