import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isExistingCustomerAccountSupportRequest, mayTransferToAccountServices, SHAVEZ_ACCOUNT_SUPPORT_GREETING, shavezHandoffTwiML, TOM_ACCOUNT_SUPPORT_HANDOFF } from "./salesAgentTransfer";

describe("Tom to Shavez account-support handoff", () => {
  it("builds a POST redirect into Shavez's account-support webhook context", () => {
    const twiml = shavezHandoffTwiML(
      "https://api.example.test/api/webhook/twilio/sales/shavez",
      "https://api.example.test/api/webhook/twilio/sales/hold-music.wav",
    );
    expect(twiml).toContain("<Play>https://api.example.test/api/webhook/twilio/sales/hold-music.wav</Play>");
    expect(twiml).toContain("<Redirect method=\"POST\">");
    expect(twiml).toContain(`/api/webhook/twilio/sales/shavez?handoff=${TOM_ACCOUNT_SUPPORT_HANDOFF}`);
    expect(twiml).toContain("</Redirect>");
    expect(twiml.indexOf("<Play>")).toBeLessThan(twiml.indexOf("<Redirect"));
    expect(SHAVEZ_ACCOUNT_SUPPORT_GREETING).toContain("Marel with Account Services");
    expect(SHAVEZ_ACCOUNT_SUPPORT_GREETING).toContain("Tom connected us");
  });

  it("uses a real ten-second hold-music asset", () => {
    const audio = readFileSync(new URL("../../public/account-services-hold.wav", import.meta.url));
    expect(audio.toString("ascii", 0, 4)).toBe("RIFF");
    expect(audio.toString("ascii", 8, 12)).toBe("WAVE");
    expect(audio.readUInt32LE(24)).toBe(8_000);
    expect(audio.readUInt32LE(40) / 2 / 8_000).toBe(10);
  });

  it("automatically routes clear account-support intent without a hold-consent gate", () => {
    expect(mayTransferToAccountServices([
      { role: "caller", text: "I'm having problems with my Cert-ex-ah account." },
    ])).toBe(true);
    expect(mayTransferToAccountServices([
      { role: "caller", text: "Can I speak with someone in Account Services?" },
    ])).toBe(true);
    expect(mayTransferToAccountServices([
      { role: "caller", text: "I am considering Certxa and want to know about billing." },
    ])).toBe(false);
    expect(mayTransferToAccountServices([
      { role: "caller", text: "I need help with my billing, but don't transfer me." },
    ])).toBe(false);
  });
});
