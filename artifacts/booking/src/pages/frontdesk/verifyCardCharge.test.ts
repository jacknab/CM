import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCardCharge } from "./verifyCardCharge";

afterEach(() => vi.unstubAllGlobals());

describe("staff POS verifies customer-screen payment notifications", () => {
  it("only accepts the captured amount and matching intent for this appointment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ amountCents: 4300, paymentIntentId: "pi_test123" }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCardCharge("pi_test123", 42, 43)).resolves.toBe(43);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("appointmentId=42"), { credentials: "include" });
    await expect(verifyCardCharge("pi_test123", 42, 42)).rejects.toThrow("does not match");
  });

  it("rejects invented payments and verification failures without creating a tender", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCardCharge("", 42, 43)).rejects.toThrow("missing its transaction ID");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(verifyCardCharge("pi_test123", 42, 43)).rejects.toThrow("could not be verified");
  });
});
