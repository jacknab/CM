-- Migration 0078: ensure staffPortalEnabled defaults to true in all existing store_settings rows
-- The flag lives inside preferences.features JSON. We only touch rows where the key is absent.

UPDATE store_settings
SET preferences = jsonb_set(
  CASE
    WHEN preferences::jsonb -> 'features' IS NULL
      THEN jsonb_set(preferences::jsonb, '{features}', '{}'::jsonb, true)
    ELSE preferences::jsonb
  END,
  '{features,staffPortalEnabled}',
  'true'::jsonb,
  true
)::text
WHERE (preferences::jsonb -> 'features' ->> 'staffPortalEnabled') IS NULL;
