import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; values: unknown[] }[], due: [] as any[], tokens: ["ExponentPushToken[a]", "ExponentPushToken[b]"], bodies: [] as any[] }));
vi.mock("../db", () => ({ pool: { query: async (sql: string, values: unknown[] = []) => {
  state.queries.push({ sql, values });
  if (sql.includes("SET status = 'sending'")) { const d = state.due; state.due = []; return { rows: d }; }
  if (sql.includes("SELECT DISTINCT token")) return { rows: state.tokens.map((token) => ({ token })) };
  if (sql.startsWith("INSERT INTO app_announcements")) return { rows: [{ id: 1, title: values[0], body: values[1], send_at: values[2], status: "scheduled" }] };
  return { rows: [] };
} } }));
vi.mock("./ownerPush", () => ({ PUSH_SOUND: "soft_chime.wav", PUSH_CHANNEL: "bookings" }));

import { createAnnouncement, sendDueAnnouncements } from "./appAnnouncements";

beforeEach(() => {
  state.queries = []; state.due = []; state.bodies = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const part = JSON.parse(init.body); state.bodies.push(part);
    return { json: async () => ({ data: part.map((m: any) => (m.to.endsWith("[b]") ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" })) }) };
  });
});

describe("App announcements", () => {
  it("refuses an empty, too long or past announcement", async () => {
    await expect(createAnnouncement({ title: "", body: "x", sendAt: new Date().toISOString() }, null)).rejects.toThrow(/title/);
    await expect(createAnnouncement({ title: "Hi", body: "x".repeat(181), sendAt: new Date().toISOString() }, null)).rejects.toThrow(/message/);
    await expect(createAnnouncement({ title: "Hi", body: "x", sendAt: "2020-01-01T00:00:00Z" }, null)).rejects.toThrow(/passed/);
    expect((await createAnnouncement({ title: "Hi", body: "Hello", sendAt: new Date(Date.now() + 3600_000).toISOString() }, "u1")).status).toBe("scheduled");
  });

  it("sends a due announcement to every phone once, counts the phones reached and forgets dead tokens", async () => {
    state.due = [{ id: 7, title: "New", body: "Business Phone is here" }];
    await sendDueAnnouncements();
    expect(state.bodies[0]).toEqual([
      expect.objectContaining({ to: "ExponentPushToken[a]", title: "New", body: "Business Phone is here", data: { type: "announcement", id: 7 } }),
      expect.objectContaining({ to: "ExponentPushToken[b]" }),
    ]);
    expect(state.queries.find((q) => q.sql.includes("SET status = 'sent'"))?.values).toEqual([7, 1]);
    expect(state.queries.find((q) => q.sql.startsWith("DELETE FROM owner_push_devices"))?.values).toEqual([["ExponentPushToken[b]"]]);
    await sendDueAnnouncements();
    expect(state.bodies).toHaveLength(1);
  });
});
