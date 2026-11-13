# Kiosk Builder — one check-in kiosk for every business type

Owner: Claude (full control given by the user 2026-11-13). Audit that led here: 2026-11-13 chat (kiosk audit).

## Goal

The self check-in kiosk (`/kiosk/:slug`) works for any business type (nail, hair, barber, spa, esthetics,
pet grooming, tattoo, other) and the business owner can shape it themselves — flow, layout, look and words —
the way a commercial kiosk backend works: drafts, preview, publish, version history, rollback, presets.

Today's kiosk design, style and behaviour are the target look: they become the default presets, so a salon
that never opens the builder sees exactly what it sees today.

Not in scope: the front-desk display (`/frontdesk/:slug`) — a different product, stays as it is.

## Decisions

- Owner-written text falls back to English for any kiosk language it wasn't written in (user, 11-13).
  Built-in kiosk text keeps its own translations (lib/kioskTranslations.ts).
- Constrained grid, not free-form drag-and-drop: fixed block types on a snap grid, minimum touch sizes,
  the same layout drawn on a 9:16 standing kiosk and a landscape tablet.
- Business rules stay on the server. A layout can hide or reorder steps and change limits within bounds;
  it can never change prices or book what the catalog doesn't sell (lib/kioskAccess.ts still verifies).
- Layouts travel inside `/api/public/kiosk/:slug/config`, so the cached config keeps working offline.

## Three layers

1. **Flow** — the ordered steps. Fixed start (welcome → phone → name for new clients) and fixed end
   (review → ticket). The middle is the owner's: `category`, `services`, `questions` (service questions,
   today's nail length/shape/design), `addons`, `provider`. Rules: `services` is required; `category` comes
   before `services`; `questions` and `addons` come after `services`; `provider` comes after `services`.
2. **Layout** — per screen, a grid of blocks (Phase 4). Until then each screen keeps today's layout, with the
   layout settings it already has (columns, cards per page, what a service card shows).
3. **Theme** — look (`classic` = today's lavender/pink, `boutique` = today's nail cream/copper), colour
   overrides, heading font, corner style, pictograms on/off. Applied as CSS variables.

Plus **vocabulary** per business type ("stylist", "nail technician", "barber", "groomer", "artist") and
**text overrides** keyed by text id, per language, English fallback.

## Data

- `shared/kiosk/businessTypes.ts` — the registry: `locations.category` → business type key, vocabulary,
  preset, roles. One place instead of regexes in several files.
- `shared/kiosk/layout.ts` — the layout type, zod schema, `normalizeKioskLayout()` (fills defaults, clamps,
  repairs step order), `kioskFlow()` (the enabled middle steps in order).
- `shared/kiosk/presets.ts` — one preset per business type.
- `kiosk_layouts` table (migration 0357): one draft row per store, numbered published versions (only the
  newest is `published`, older ones `archived`, never edited — rollback publishes a copy as a new version).
- No row → the business type's preset is served (today's behaviour).

## API

- `GET    /api/kiosk-builder` — draft (or published, or preset) + published version + business type + presets
- `PUT    /api/kiosk-builder/draft` — save the draft (validated, normalized)
- `POST   /api/kiosk-builder/publish` — draft → new published version
- `GET    /api/kiosk-builder/versions` — history
- `POST   /api/kiosk-builder/versions/:version/restore` — copy a version into the draft
- `POST   /api/kiosk-builder/reset` — draft ← a preset
- `GET    /api/public/kiosk/:slug/config` — adds `layout` (published, else preset); `?preview=draft` for a
  signed-in owner returns the draft (the editor's live preview).
- `POST   /api/public/kiosk/:slug/checkin` — service count / visit length limits come from the published layout.

## Phases

0. **Clean-up** — config sends the real kiosk switch (done 11-13); dead overlay and settings go when their
   replacements land.
1. **Foundation** — registry, layout schema, presets, table, API, config carries the layout, kiosk reads it:
   flow engine for the middle steps, look, vocabulary, limits, text overrides. No visual change.
2. **Builder UI: look & words** — Settings › Kiosk Builder: theme, vocabulary, text per language, welcome
   picture, live preview, publish, history.
3. **Builder UI: flow** — turn steps on/off, reorder within the rules, per-step settings, presets.
4. **Grid layout** — per-screen block grid editor and block renderer, starting with welcome and services.
5. **Service questions for every business** — generalise the nail length/shape/design steps into per-service
   questions (fade type, pet size, placement…); Smart Check-In rules per business type.

## Status

- 2026-11-13: plan written; Phase 0 fix (config sends the real kiosk switch).
- 2026-11-13: **Phase 1 LIVE.** shared/kiosk/{businessTypes,layout,presets,text}.ts; kiosk_layouts (0357, applied);
  lib/kioskLayouts.ts + routes/kioskBuilder.ts; /config sends `layout`, `layoutVersion`, `businessType`
  (`?preview=draft` for a signed-in login); check-in limits and Smart Check-In read the published layout.
  Kiosk: flow engine (category off → all services; questions/addons/provider in the layout's order),
  theme from the layout (+ colour overrides), welcome picture + language buttons, service limits, text
  overrides with English fallback. Checked: 16 unit tests, DB smoke test on store 41 (rows removed), live
  walk-through in headless Chromium of the nail preset and a customised layout.
- Next: Phase 2 (Settings › Kiosk Builder UI). Then retire the dead overlay + old kiosk settings fields.
