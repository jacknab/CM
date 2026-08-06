---
name: Dev sandbox ESM resolution quirk
description: Plain `node file.mjs` inside a pnpm workspace subpackage can transiently fail to resolve real, installed dependencies until a fresh pnpm install.
---

Observed in this Replit dev sandbox: running a `.mjs` script directly (`node ./src/foo.mjs`, or via `pnpm --filter <pkg> run <script>`) failed with `ERR_MODULE_NOT_FOUND` for a package (`pg`) that was correctly listed as a dependency and present as a symlink in `node_modules`. The symlink target existed on disk and pointed to a valid `.pnpm` store entry.

The failure was NOT specific to the new script — an existing, previously-working sibling script with an identical import failed the exact same way, confirming it wasn't a code bug.

**Why:** the pnpm-managed `node_modules` symlink tree can get into a stale/inconsistent state relative to node's ESM resolver in this sandbox (cause not fully diagnosed — possibly a stale store link left over from prior edits/installs). This is environment state, not a lockfile or dependency-declaration problem.

**How to apply:** if a script that imports a real, installed dependency fails with `ERR_MODULE_NOT_FOUND` for that dependency, don't assume the script or package.json is wrong — first try `pnpm install --filter <affected-package>...` (or a full `pnpm install`) and retest before debugging the script itself. Only dig into the script's own resolution logic if the failure persists after a fresh install.
