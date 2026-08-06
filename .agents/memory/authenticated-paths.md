---
name: authenticatedPaths list
description: App.tsx gates StoreProvider (and SnapshotProvider/AccountStatusGate) behind this list — any route missing from it renders without store context, causing selectedStore to always be null.
---

## The rule

Every page that uses `useSelectedStore()`, `useStores()`, or any hook that depends on `StoreContext` MUST appear in the `authenticatedPaths` array in `artifacts/booking/src/App.tsx`.

**Why:** `AppRoutes` only wraps the route tree in `<StoreProvider>` when `isAuthenticatedRoute` is true. `isAuthenticatedRoute` is computed by checking `authenticatedPaths`. If a route is missing, the page renders with the default context value (`selectedStore: null`). This causes:
- `useQuery` for store-scoped data to be disabled (`enabled: false`)
- All guard checks like `if (!selectedStore?.id) return` to fire silently
- Zero visual feedback — the UI renders with DEFAULT values and clicks do nothing

**How to apply:** Whenever a new authenticated page/route is added, immediately add its path to `authenticatedPaths` in App.tsx. This was the root cause of the `/features-settings` toggle bug — the page was routed but not listed, so StoreProvider never wrapped it.

## Example of the bug

`/features-settings` was added as a `<Route>` but not added to `authenticatedPaths`. Result: `selectedStore` was always `null`, features showed as ON (from DEFAULT_FLAGS), and every toggle click silently returned early — "nothing happens."
