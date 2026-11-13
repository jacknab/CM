import { describe, expect, it, vi } from "vitest";

// Marel's call-back memory: every call from this number today (owner, 2026-11-11; whole day 2026-11-13). No real database.
const state = vi.hoisted(() => ({ rows: [] as any[], sql: "", values: [] as unknown[] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: unknown[]) => { state.sql = sql; state.values = values; return { rows: state.rows }; } } }));

import { callbackGreetingInstruction, lastCallForPrompt, marelLastCall } from "./marelLastCall";

const minAgo = (m: number) => new Date(Date.now() - m * 60_000);
const call = (endedMinAgo: number, summary: string | null, transcript: { role: string; text: string }[], structured: object | null = null) =>
  ({ started_at: minAgo(endedMinAgo + 3), ended_at: minAgo(endedMinAgo), duration_seconds: 180, summary, structured_summary: structured, transcript });

describe("Marel remembers the caller's calls today", () => {
  it("looks up this number's finished calls to Marel today, not the current call", async () => {
    state.rows = [call(20, "Shavez sent a password reset e-mail.", [
      { role: "caller", text: "This is Kevin, I can't sign in." }, { role: "tom", text: "I've sent a password reset e-mail to the address on file." }])];
    const c = await marelLastCall("+15205550111", "CA_NOW");
    expect(state.values.slice(0, 4)).toEqual(["+15205550111", "CA_NOW", "America/New_York", "shavez"]);
    expect(state.sql).toContain("date_trunc('day', now() AT TIME ZONE $3)");
    expect(state.sql).toContain("ORDER BY started_at ASC");
    expect(c).toMatchObject({ minutesAgo: 20, calls: [{ turns: [{ who: "caller", text: "This is Kevin, I can't sign in." }, { who: "you" }] }] });
    const prompt = lastCallForPrompt(c!);
    expect(prompt).toContain("called you once already today");
    expect(prompt).toContain("Marel sent a password reset e-mail.");
    expect(prompt).toContain("does NOT verify them".replace("does", "do"));
    expect(callbackGreetingInstruction(c!)).toContain("hello again");
  });

  it("reads every call today, oldest first, so a third call is caught up on the whole day", async () => {
    state.rows = [
      call(180, "Shavez helped with a password reset; the caller asked about Business Phone.", [
        { role: "caller", text: "Hi, it's Toby, I can't log in." }, { role: "tom", text: "I've sent the reset e-mail." },
        { role: "caller", text: "Got it, the reset worked. How much is Business Phone?" }, { role: "tom", text: "It's ten dollars a month." }],
        { outcome: "password reset done", commitments: ["Text the Business Phone details"], nextAction: "Caller decides on Business Phone" }),
      call(60, "The caller asked to cancel; Shavez e-mailed the billing page link.", [
        { role: "caller", text: "Actually I want to cancel." }, { role: "tom", text: "I've e-mailed you the billing page link." }],
        { outcome: "billing page link sent" }),
    ];
    const c = await marelLastCall("+15205550111", "CA_NOW");
    expect(c!.calls).toHaveLength(2);
    expect(c!.minutesAgo).toBe(60);
    const prompt = lastCallForPrompt(c!);
    expect(prompt).toContain("called you twice already today");
    expect(prompt.indexOf("Call 1 of 2")).toBeLessThan(prompt.indexOf("Call 2 of 2 (the most recent)"));
    expect(prompt).toContain("Got it, the reset worked.");
    expect(prompt).toContain("Promised on that call: Text the Business Phone details");
    expect(prompt).toContain("Outcome: billing page link sent");
    expect(prompt).toContain("Never ask a question they already answered on any call today");
    const greet = callbackGreetingInstruction(c!);
    expect(greet).toContain("3rd call today");
    expect(greet).toContain("where things stand now");
  });

  it("keeps a long day to a sensible size: newest conversations in full, the oldest down to their summaries", async () => {
    const long = (who: string) => Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? "tom" : "caller", text: `${who} ${"x".repeat(380)} ${i}` }));
    state.rows = [call(300, "First call.", long("first")), call(200, "Second call.", long("second")), call(100, "Third call.", long("third"))];
    const c = await marelLastCall("+15205550111", "CA_NOW");
    expect(c!.calls.map((x) => x.transcriptLeftOut)).toEqual([true, false, false]);
    const prompt = lastCallForPrompt(c!);
    expect(prompt).toContain("Summary: First call.");
    expect(prompt).toContain("Conversation left out to save space");
  });

  it("doesn't count a call where the caller never said anything", async () => {
    state.rows = [call(5, null, [{ role: "tom", text: "Account services, this is Marel." }, { role: "caller", text: "  " }])];
    expect(await marelLastCall("+15205550111", "CA_NOW")).toBeNull();
    expect(state.sql).toContain("t->>'role' = 'caller'");
  });

  it("is quiet for a first-time caller or an unknown number", async () => {
    state.rows = [];
    expect(await marelLastCall("+15205550111", "CA_NOW")).toBeNull();
    expect(await marelLastCall(null, "CA_NOW")).toBeNull();
  });

  it("lets Tom use the same number's calls without a separate identity check", async () => {
    state.rows = [call(10, "Tom texted a trial link.", [{ role: "caller", text: "I'm Lisa, send me the trial link." }, { role: "tom", text: "Sent!" }])];
    const c = await marelLastCall("+15205550111", "CA_NOW", "tom");
    expect(state.values[3]).toBe("tom");
    expect(lastCallForPrompt(c!)).toContain("without a separate identity check");
  });
});
