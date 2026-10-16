import { describe, expect, it } from "vitest";
import { api as full } from "@shared/routes";
import { api as paths } from "@shared/apiPaths";

// The browser uses shared/apiPaths.ts (no database schema inside); the server uses shared/routes.ts.
// They must list the same routes with the same methods and paths.
describe("shared/apiPaths matches shared/routes", () => {
  it("has every route, with the same method and path", () => {
    const pick = (api: Record<string, Record<string, { method: string; path: string }>>) =>
      Object.fromEntries(Object.entries(api).map(([g, actions]) =>
        [g, Object.fromEntries(Object.entries(actions).map(([n, d]) => [n, { method: d.method, path: d.path }]))]));
    expect(pick(paths as any)).toEqual(pick(full as any));
  });
});
