import { describe, expect, it } from "vitest";
import { sendOutcome } from "../intelligence/sms-guard";

describe("sendOutcome — the intelligence log records what really happened to a text (2026-10-24)", () => {
  it("is sent only when the text went out", () => {
    expect(sendOutcome({ success: true, sid: "SM1" } as any)).toBe("sent");
    expect(sendOutcome({ success: true, skipped: true })).toBe("skipped");
    expect(sendOutcome({ success: false, error: "Invalid phone number" } as any)).toBe("failed");
    expect(sendOutcome(undefined)).toBe("failed");
  });
});
