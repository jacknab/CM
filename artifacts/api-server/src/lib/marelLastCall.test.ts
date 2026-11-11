import { describe, expect, it, vi } from "vitest";

// Marel's call-back memory (owner, 2026-11-11). No real database.
const state = vi.hoisted(() => ({ row: null as any, sql: "", values: [] as unknown[] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: unknown[]) => { state.sql = sql; state.values = values; return { rows: state.row ? [state.row] : [] }; } } }));

import { callbackGreetingInstruction, lastCallForPrompt, marelLastCall } from "./marelLastCall";

describe("Marel remembers the caller's last call", () => {
  it("finds this number's last finished call to Marel in the past day, not the current call", async () => {
    state.row = { started_at: new Date(), ended_at: new Date(Date.now() - 20 * 60_000), summary: "Shavez sent a password reset e-mail.", transcript: [
      { role: "caller", text: "This is Kevin, I can't sign in." }, { role: "tom", text: "I've sent a password reset e-mail to the address on file." }] };
    const c = await marelLastCall("+15205550111", "CA_NOW");
    expect(state.values.slice(0, 2)).toEqual(["+15205550111", "CA_NOW"]);
    expect(state.sql).toContain("sales_agent_id = $4");
    expect(state.values[3]).toBe("shavez");
    expect(c).toMatchObject({ minutesAgo: 20, turns: [{ who: "caller", text: "This is Kevin, I can't sign in." }, { who: "you" }] });
    const prompt = lastCallForPrompt(c!);
    expect(prompt).toContain("20 minutes ago");
    expect(prompt).toContain("Marel sent a password reset e-mail.");
    expect(prompt).toContain("does NOT verify them");
    expect(callbackGreetingInstruction(c!)).toContain("hello again");
  });

  it("doesn't count a call where the caller never said anything", async () => {
    state.row = { started_at: new Date(), ended_at: new Date(), summary: null, transcript: [{ role: "tom", text: "Account services, this is Marel." }, { role: "caller", text: "  " }] };
    expect(await marelLastCall("+15205550111", "CA_NOW")).toBeNull();
    expect(state.sql).toContain("t->>'role' = 'caller'");
  });

  it("is quiet for a first-time caller or an unknown number", async () => {
    state.row = null;
    expect(await marelLastCall("+15205550111", "CA_NOW")).toBeNull();
    expect(await marelLastCall(null, "CA_NOW")).toBeNull();
  });
});
