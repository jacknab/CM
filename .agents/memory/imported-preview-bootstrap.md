---
name: Imported preview bootstrap
description: The primary production preview can exceed workflow startup limits while template thumbnails are generated during API bootstrap.
---

The production preview should become available before nonessential template thumbnail generation completes.

**Why:** A fresh imported checkout reached the API's listening state but the workflow timed out while thumbnail builds continued, making visual verification unreliable.

**How to apply:** When debugging preview startup, distinguish the app port becoming ready from background template seeding; avoid treating slow thumbnail work as a frontend build failure.