---
name: Template VPS deployment boundary
description: Local template source and dist changes do not affect certxa.com until the updated repository is deployed to the VPS.
---

Template preview bundles are served from the VPS filesystem, so a local rebuild can pass while the public preview continues serving an older asset until the VPS deployment completes.

**Why:** Public preview verification showed the previous bundle after the source and tracked dist files were fixed locally.

**How to apply:** After changing a template, deploy the source and generated `dist` output to the VPS, then verify the public `/api/templates/:id/preview/assets/...` response rather than relying only on local builds.