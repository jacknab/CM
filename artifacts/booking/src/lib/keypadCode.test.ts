import { beforeEach, describe, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { QueryClient } from "@tanstack/react-query";

const db = vi.hoisted(() => ({ cache: new Map<string, unknown>() }));
vi.mock("@/lib/nail-offline", () => ({
  nailOfflineStore: () => 2,
  nailOffline: {
    remember: async (storeId: number, url: string, data: unknown) => { db.cache.set(`${storeId}:${url}`, { data, at: "" }); },
    recall: async (storeId: number, url: string) => db.cache.get(`${storeId}:${url}`),
  },
}));

import { scanKeypadCode } from "./keypadCode";

const hash = (code: string) => createHash("sha256").update(`certxa-show-keypad:${code}`).digest("hex");
let qc: QueryClient;
beforeEach(() => {
  db.cache.clear();
  qc = new QueryClient();
  qc.setQueryData(["/api/nail/screen-settings", 2], { lockScreen: true, keypadVisible: true });
});

describe("the salon's KEYPAD QR", () => {
  test("online: the server switches it and the screen follows", async () => {
    (globalThis as any).fetch = async () => new Response(JSON.stringify({ ok: true, keypadVisible: false }), { status: 200 });
    expect(await scanKeypadCode("kp:abcdefgh", qc)).toEqual({ ok: true, keypadVisible: false });
    expect(qc.getQueryData<any>(["/api/nail/screen-settings", 2]).keypadVisible).toBe(false);
  });

  test("no internet: this tablet's copy of the code switches it, hide then show", async () => {
    (globalThis as any).fetch = async () => { throw new TypeError("Failed to fetch"); };
    db.cache.set("2:/api/nail/manager-pin/offline", { data: { hash: null, isDefault: true, badges: [], showKeypad: hash("KP:ABCDEFGH") }, at: "" });
    expect(await scanKeypadCode("KP:ABCDEFGH", qc)).toEqual({ ok: true, keypadVisible: false });
    expect(await scanKeypadCode("KP:ABCDEFGH", qc)).toEqual({ ok: true, keypadVisible: true });
    expect((await scanKeypadCode("KP:ZZZZZZZZ", qc)).ok).toBe(false);
  });
});
