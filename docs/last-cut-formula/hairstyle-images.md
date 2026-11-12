# Hairstyle reference images: batch plan

The library has 200 global styles and **no images yet**. Nothing is shown to barbers until an image is uploaded and approved.

- `hairstyle-image-manifest.json` lists 1,000 slots: every style has a front, left, right and back view (required) and a detail view (optional). Each slot has:
  - the suggested R2 key (`hairstyles/global/<slug>/<view>-1.webp`);
  - alt text;
  - a generation prompt.

  Regenerate the manifest with `pnpm tsx ../../scripts/export-hairstyle-image-manifest.ts`, run from `artifacts/api-server`.
- The prompts keep one illustrated model and the same haircut across the views of a style. They ask for no real or recognisable person, no text and no logos. Use only images Certxa owns or generated: no third-party photos without written permission.
- To upload and approve, use `/isadmin/hairstyle-library` (platform admins only).
  1. Pick a style.
  2. Upload one image per view.
  3. Preview it.
  4. Approve it or reject it.

  "Replace" uploads a corrected image. Approving the replacement retires the old one, which is kept as rejected and never deleted.
- Files go to Cloudflare R2 through `uploadToR2` (converted to WebP). The database stores the key that was actually written, never an invented one. Approval records the admin's user id and the time.
- Barbers only ever see approved images:
  - in the Last Cut Formula panels;
  - in the hairstyle details (`GET /api/hairstyles/:id`).
