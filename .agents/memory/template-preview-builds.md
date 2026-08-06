---
name: Template preview builds
description: Built-in website templates need an explicit thumbnail build, and preview preparation must never mutate catalogued source files.
---

Built-in templates with `thumbnail = NULL` must trigger the screenshot pipeline even when their database row already exists; otherwise the catalog remains in its processing state forever. The screenshot worker must sanitize only an isolated temporary copy, never delete lockfiles or package-manager config from the source template.

**Why:** The Lacquer seed previously marked an existing row as built and returned before starting the preview build, while the builder UI interpreted any thumbnail-less non-failed row as still generating. The worker also removed the source package lockfile during preparation.

**How to apply:** When adding or repairing a seeded template, ensure the seed starts `buildAndScreenshot` for missing thumbnails and persists `ready` or `failed`. Keep all install/build sanitization inside the copied `/tmp` project.