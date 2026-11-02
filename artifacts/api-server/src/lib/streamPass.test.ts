import { describe, expect, it } from "vitest";
import { issueStreamPass, redeemStreamPass } from "./streamPass";

describe("agent-scoped sales stream passes", () => {
  it("accepts Shavez passes only for Shavez and consumes them once", () => {
    const previousSecret = process.env.STREAM_PASS_SECRET;
    process.env.STREAM_PASS_SECRET = "sales-agent-stream-pass-test-secret";
    try {
      const pass = issueStreamPass("sales-shavez", 1);
      expect(redeemStreamPass("sales", pass)).toBeNull();
      expect(redeemStreamPass("sales-shavez", pass)).toBe(1);
      expect(redeemStreamPass("sales-shavez", pass)).toBeNull();
    } finally {
      if (previousSecret === undefined) delete process.env.STREAM_PASS_SECRET;
      else process.env.STREAM_PASS_SECRET = previousSecret;
    }
  });
});
