import { describe, it, expect } from "vitest";
import { memoryKV } from "./store";
import { moveOnce, movedKV, nativeSqliteKV } from "./nativeKV";

/** A stand-in for the app's database: rows of (store, key, JSON text), answering the same requests. */
function fakeApp() {
  const rows = new Map<string, string>();
  const id = (store: string, key: string) => `${store}\u0000${key}`;
  const send = async (req: any): Promise<unknown> => {
    if (req.op === "get") return rows.get(id(req.store, req.key)) ?? null;
    if (req.op === "getAll") return [...rows].filter(([k]) => k.startsWith(req.store + "\u0000")).map(([, v]) => v);
    if (req.op === "keys") return [...rows.keys()].filter((k) => k.startsWith(req.store + "\u0000")).map((k) => k.split("\u0000")[1]);
    if (req.op === "batch") { for (const w of req.writes) { if (w.value === null) rows.delete(id(w.store, w.key)); else rows.set(id(w.store, w.key), w.value); } return null; }
    throw new Error("unknown");
  };
  return { rows, send };
}

describe("the app's database as the offline store", () => {
  it("stores, reads back, lists and deletes values", async () => {
    const kv = nativeSqliteKV(fakeApp().send);
    await kv.batch([{ store: "records", key: "a", value: { n: 1 } }, { store: "records", key: "b", value: { n: 2 } }, { store: "meta", key: "counter", value: 7 }]);
    expect(await kv.get("records", "a")).toEqual({ n: 1 });
    expect(await kv.get("meta", "counter")).toBe(7);
    expect(await kv.get("records", "missing")).toBeUndefined();
    expect((await kv.keys("records")).sort()).toEqual(["a", "b"]);
    expect(await kv.getAll("records")).toHaveLength(2);
    await kv.batch([{ store: "records", key: "a", value: undefined }]);
    expect(await kv.get("records", "a")).toBeUndefined();
  });
});

describe("moving from the browser's storage to the app's database", () => {
  it("carries over everything once, including the queue of unsent changes", async () => {
    const browser = memoryKV();
    await browser.batch([{ store: "ops", key: "op1", value: { type: "ticket.create" } }, { store: "records", key: "-1", value: { kind: "ticket" } }, { store: "meta", key: "counter", value: 3 }]);
    const app = nativeSqliteKV(fakeApp().send);
    expect(await moveOnce(browser, app)).toBe(true);
    expect(await app.get("ops", "op1")).toEqual({ type: "ticket.create" });
    expect(await app.get("records", "-1")).toEqual({ kind: "ticket" });
    expect(await app.get("meta", "counter")).toBe(3);
    // A second run does nothing, even if the browser's storage has changed since.
    await browser.batch([{ store: "meta", key: "counter", value: 99 }]);
    expect(await moveOnce(browser, app)).toBe(false);
    expect(await app.get("meta", "counter")).toBe(3);
  });

  it("never overwrites what the app's database already holds", async () => {
    const browser = memoryKV();
    await browser.batch([{ store: "meta", key: "counter", value: 3 }]);
    const app = nativeSqliteKV(fakeApp().send);
    await app.batch([{ store: "meta", key: "counter", value: 10 }]);
    await moveOnce(browser, app);
    expect(await app.get("meta", "counter")).toBe(10);
  });

  it("moves before the first read or write through the combined store", async () => {
    const browser = memoryKV();
    await browser.batch([{ store: "records", key: "-1", value: { kind: "ticket" } }]);
    const kv = movedKV(browser, nativeSqliteKV(fakeApp().send));
    expect(await kv.keys("records")).toEqual(["-1"]);
  });
});
