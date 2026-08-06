---
name: Multilingual Content Translations
description: AI-powered translation system for salon business content (services, categories, add-ons, products) in es, vi, zh, ko.
---

## Architecture

- **DB**: `entity_translations` table — migration `0074_entity_translations.sql`; also created at startup via `ensureTranslationsTable()` in `lib/translationService.ts`.
- **Engine**: `artifacts/api-server/src/lib/translationService.ts` — `triggerTranslation()` is fire-and-forget (via `setImmediate`); uses `gpt-4o-mini` + `AI_INTEGRATIONS_OPENAI_API_KEY`.
- **Routes**: `artifacts/api-server/src/routes/translations.ts` — mounted at `/api/translations` in `index.ts`.
- **Frontend**: `artifacts/booking/src/pages/TranslationsPage.tsx` — route `/settings/translations`, tile in SettingsLanding Business group.

## Languages supported

English is the base (stored on the entity itself). Translations generated for: `es` (Spanish), `vi` (Vietnamese), `zh` (Chinese Simplified), `ko` (Korean).

## Auto-trigger hooks

`triggerTranslation()` is called (non-blocking) after create/update of:
- `service_categories` (routes.ts ~line 2436, 2453)
- `services` (routes.ts ~line 2494, 2533)
- `addons` (routes.ts ~line 2645, 2663)
- `products` (routes.ts ~line 4342, 4359)

**Why:** Only fires when name or description actually changed — avoids re-translating on unrelated PATCH fields.

## Upsert logic

`ON CONFLICT (entity_type, entity_id, language) DO UPDATE` — never overwrites user-edited translations (`is_edited_by_user = TRUE`). AI regeneration skips user edits; manual edits always win.

## API endpoints

- `GET /api/translations/store` — all translations for current store, grouped by entity type
- `GET /api/translations/:type/:id` — translations for one entity
- `PUT /api/translations/:type/:id/:lang` — manual override (sets is_edited_by_user=TRUE)
- `POST /api/translations/:type/:id/regenerate` — re-trigger AI for one entity
- `POST /api/translations/store/regenerate-all` — batch re-generate all entities for store
