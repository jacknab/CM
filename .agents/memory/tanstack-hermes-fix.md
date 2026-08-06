---
name: tanstack-query-core Hermes private fields fix
description: How to fix "SyntaxError: private properties are not supported" on iOS Expo Go caused by @tanstack/query-core v5
---

## The Problem
`@tanstack/query-core` v5 ships two builds:
- `build/legacy/index.cjs` — ES2015, **no** private class fields → Hermes-safe
- `build/modern/index.cjs` — modern,  **has** private class fields (`#x`) → crashes Hermes on iOS

The `package.json` **exports** field overrides the `main` field and points Metro at the modern build. Hermes (React Native's JS engine) cannot parse private class fields at the bundle parse level, causing:
```
SyntaxError: 4037:5: private properties are not supported
```

**Why transformIgnorePatterns doesn't work:** In a pnpm workspace, packages live at `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/`. Metro's regex matches on the first `node_modules/` and never reaches the inner path, so the package is excluded from Babel transformation.

## The Fix (Preferred — Metro config)
Set `unstable_enablePackageExports = false` in `metro.config.js`. Metro then ignores the `exports` field entirely and falls back to `main`, which already points to `build/legacy/index.cjs`.

```js
// apps/staff-mobile/metro.config.js  (also apps/certxa-pos/metro.config.js)
config.resolver.unstable_enablePackageExports = false;
```

**Why this is better than runtime patching:** It works on any machine/pnpm version without knowing the virtual-store path. The patch approach was fragile — on different pnpm versions, the symlink at `node_modules/.pnpm/node_modules/@tanstack/query-core` may not exist, so the patch never applied and the error persisted on VPS deployments.

## Belt-and-suspenders: Runtime Patch (in startup scripts)
Both `scripts/mobile-start.sh` and `scripts/pos-start.sh` also patch the exports field at startup. The patch now uses `find` to discover all copies instead of a hardcoded hoisted path:

```js
const { execSync } = require('child_process');
const found = execSync("find node_modules -name 'package.json' -path '*/query-core/package.json' 2>/dev/null")
  .toString().trim().split('\n').filter(Boolean);
const targets = new Set(found);
for (const f of found) {
  const real = fs.realpathSync(path.dirname(f));
  targets.add(path.join(real, 'package.json'));
}
```

## pnpm path notes
- Real path: `node_modules/.pnpm/@tanstack+query-core@5.90.20/node_modules/@tanstack/query-core/package.json`
- The hoisted symlink at `.pnpm/node_modules/@tanstack/query-core` may NOT exist on all pnpm versions — do NOT rely on it.

## Why it broke with Expo SDK 56
React Native 0.76 (Expo SDK 56) introduced `unstable_enablePackageExports: true` as a default in Metro. Before that, Metro ignored the exports field and fell back to `main` (the legacy build). The new default broke Hermes compatibility.

**How to apply:** Any new Expo/React Native app in the workspace that uses `@tanstack/react-query` must have `unstable_enablePackageExports = false` in its `metro.config.js`.
