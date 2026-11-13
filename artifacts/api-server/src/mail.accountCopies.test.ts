import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ to: [] as string[], extras: {} as Record<string, string[]> }));
vi.mock("mailgun.js", () => ({ default: class { client() { return { messages: { create: async (_d: string, m: { to: string }) => { sent.to.push(m.to); return { id: "m" }; } } }; } } }));
vi.mock("./db", () => ({ pool: { query: async () => ({ rows: [] }) } }));
vi.mock("./lib/accountEmails", () => ({ accountCopyRecipients: async (to: string) => sent.extras[to.toLowerCase()] ?? [] }));

import { sendEmail } from "./mail";

describe("account e-mails also go to the owner's added addresses (owner, 2026-11-13)", () => {
  beforeEach(() => { sent.to = []; sent.extras = {}; process.env.MAILGUN_API_KEY = "k"; process.env.MAILGUN_DOMAIN = "mg.example"; });

  it("sends to the login address and then to each confirmed added address", async () => {
    sent.extras["owner@salon.example"] = ["second@salon.example", "third@salon.example"];
    const r = await sendEmail(1, "owner@salon.example", "Your trial", "<p>hi</p>");
    expect(r.success).toBe(true);
    expect(sent.to).toEqual(["owner@salon.example", "second@salon.example", "third@salon.example"]);
  });

  it("an address with no added e-mails (a client, or an account without extras) gets only its own copy", async () => {
    await sendEmail(1, "client@example.com", "Booking confirmed", "<p>hi</p>");
    expect(sent.to).toEqual(["client@example.com"]);
  });
});
