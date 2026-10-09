import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "./staleBuild";

describe("isStaleChunkError", () => {
  it("recognises a missing page chunk from an older build (Chrome, Safari, Firefox wording)", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://certxa.com/assets/OwnerDashboard-iicEWZ9L.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module: https://certxa.com/assets/x.js"))).toBe(true);
  });
  it("leaves ordinary errors alone", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
