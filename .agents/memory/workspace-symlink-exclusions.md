---
name: Workspace symlink exclusions
description: Generated symlinks under artifacts can be discovered as duplicate pnpm workspace packages.
---

The `artifacts/*` workspace glob must exclude generated symlinks that point to canonical packages elsewhere in the monorepo, especially `artifacts/scripts` and `artifacts/shared`.

**Why:** pnpm otherwise discovers the same package twice under one name. Recursive guard commands then execute twice, produce misleading `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` output, and can make deploy diagnostics appear broken even when the repair branch is designed to continue.

**How to apply:** when adding or restoring generated symlinks beneath `artifacts/`, add explicit negated workspace entries and regenerate `pnpm-lock.yaml`; verify each package name appears only once in `pnpm -r list --depth -1 --json`.