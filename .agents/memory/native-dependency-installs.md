---
name: Native dependency installs
description: Imported pnpm workspaces may skip native install scripts, preventing server startup.
---

Fresh installs in this workspace disable package install scripts globally. Native dependencies can therefore appear installed while their runtime binding is missing; the API may fail before environment validation.

**Why:** The import's first install left bcrypt without its `.node` binding, so the API workflow exited immediately even though the JavaScript package was present.

**How to apply:** When a server fails with a missing native binding after a fresh install, rebuild the exact package instance with scripts enabled before investigating application code. Preserve the existing dependency versions unless the package firewall blocks a locked artifact.