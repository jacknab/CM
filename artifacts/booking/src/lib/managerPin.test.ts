import { beforeEach, describe, expect, test, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

// The tablet's offline database, in memory.
const db = vi.hoisted(() => ({ cache: new Map<string, unknown>(), store: 2 as number | null }));
vi.mock("@/lib/nail-offline", () => ({
  nailOfflineStore: () => db.store,
  nailOffline: {
    remember: async (storeId: number, url: string, data: unknown) => { db.cache.set(`${storeId}:${url}`, { data, at: "" }); },
    recall: async (storeId: number, url: string) => db.cache.get(`${storeId}:${url}`),
  },
}));

import { checkManagerPin, checkManagerPinOffline, refreshOfflineManagerPin } from "./managerPin";

const storage = new Map<string, string>();
let server: { hash: string | null; isDefault: boolean; badges?: { techId: number; hash: string }[] } | "down" = "down";
const badgeHash = (secret: string) => createHash("sha256").update(`certxa-manager-badge:${secret}`).digest("hex");

beforeEach(() => {
  db.cache.clear();
  db.store = 2;
  storage.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } };
  (globalThis as any).fetch = async (url: string) => {
    if (server === "down") throw new TypeError("Failed to fetch");
    if (url.endsWith("/manager-pin/offline")) return new Response(JSON.stringify(server), { status: 200 });
    throw new TypeError("Failed to fetch");
  };
});

describe("the manager PIN with no internet", () => {
  test("a PIN changed on another device is the one this tablet accepts offline", async () => {
    // This tablet once had 4821 accepted online (the old way kept only that).
    server = { hash: bcrypt.hashSync("4821", 4), isDefault: false };
    await refreshOfflineManagerPin(2);
    expect(await checkManagerPinOffline("4821")).toBe(true);
    // Changed to 7350 on the other POS: the server announces it and this tablet fetches the new one.
    server = { hash: bcrypt.hashSync("7350", 4), isDefault: false };
    await refreshOfflineManagerPin(2);
    server = "down";
    expect(await checkManagerPin("7350")).toBe("ok");
    expect(await checkManagerPin("4821")).toBe("wrong");
  });

  test("a PIN never typed on this tablet still works offline", async () => {
    server = { hash: bcrypt.hashSync("6194", 4), isDefault: false };
    await refreshOfflineManagerPin(2);
    server = "down";
    expect(await checkManagerPin("6194")).toBe("ok");
    expect(await checkManagerPin("2026")).toBe("wrong");
  });

  test("a salon still on the default PIN", async () => {
    server = { hash: null, isDefault: true };
    await refreshOfflineManagerPin(2);
    server = "down";
    expect(await checkManagerPin("2026")).toBe("ok");
    expect(await checkManagerPin("1111")).toBe("wrong");
  });

  test("a failed refresh keeps the copy it has", async () => {
    server = { hash: bcrypt.hashSync("6194", 4), isDefault: false };
    await refreshOfflineManagerPin(2);
    server = "down";
    await refreshOfflineManagerPin(2);
    expect(await checkManagerPinOffline("6194")).toBe(true);
  });

  test("before any copy: the shared default, as before", async () => {
    server = "down";
    expect(await checkManagerPinOffline("2026")).toBe(true);
    expect(await checkManagerPinOffline("6194")).toBe(false);
  });

  test("a manager badge counts as the PIN offline; a reprinted one replaces it", async () => {
    server = { hash: bcrypt.hashSync("6194", 4), isDefault: false, badges: [{ techId: 7, hash: badgeHash("K3Q7XB") }] };
    await refreshOfflineManagerPin(2);
    server = "down";
    expect(await checkManagerPin("M7-K3Q7XB")).toBe("ok");
    expect(await checkManagerPin("m7-k3q7xb")).toBe("ok");
    expect(await checkManagerPin("M8-K3Q7XB")).toBe("wrong");
    expect(await checkManagerPin("6194")).toBe("ok");
    // Reprinted: the old badge stops working once this tablet has the new copy.
    server = { hash: bcrypt.hashSync("6194", 4), isDefault: false, badges: [{ techId: 7, hash: badgeHash("ZZ2ABC") }] };
    await refreshOfflineManagerPin(2);
    server = "down";
    expect(await checkManagerPin("M7-K3Q7XB")).toBe("wrong");
    expect(await checkManagerPin("M7-ZZ2ABC")).toBe("ok");
  });

  test("a badge never works offline before the tablet has the list", async () => {
    server = "down";
    expect(await checkManagerPinOffline("M7-K3Q7XB")).toBe(false);
  });
});
