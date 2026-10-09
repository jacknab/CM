import { describe, expect, it, vi } from "vitest";

// A stand-in pool: the advisory lock itself is Postgres' job; here we check this process's side —
// one holder at a time per salon, re-entrancy, and at most one connection taken per salon at once.
const state = vi.hoisted(() => ({ open: 0, maxOpen: 0 }));
vi.mock("../db", () => ({
  pool: {
    connect: async () => {
      state.open += 1; state.maxOpen = Math.max(state.maxOpen, state.open);
      return { query: async () => ({ rows: [] }), release: () => { state.open -= 1; } };
    },
  },
}));

import { withTurnLock } from "../lib/turnLock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withTurnLock", () => {
  it("runs one turn decision at a time for a salon, in the order they arrived", async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => withTurnLock(1, async () => { log.push(`${name}:in`); await sleep(ms); log.push(`${name}:out`); return name; });
    const results = await Promise.all([job("a", 20), job("b", 5), job("c", 1)]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["a:in", "a:out", "b:in", "b:out", "c:in", "c:out"]);
  });

  it("takes only one database connection per salon however many are waiting", async () => {
    state.maxOpen = 0;
    await Promise.all(Array.from({ length: 8 }, () => withTurnLock(2, () => sleep(2))));
    expect(state.maxOpen).toBe(1);
    expect(state.open).toBe(0);
  });

  it("lets code that already holds the salon's lock ask for it again without waiting on itself", async () => {
    const out = await withTurnLock(3, () => withTurnLock(3, async () => "inner"));
    expect(out).toBe("inner");
  });

  it("does not make different salons wait for each other", async () => {
    const log: string[] = [];
    await Promise.all([
      withTurnLock(4, async () => { await sleep(15); log.push("salon4"); }),
      withTurnLock(5, async () => { log.push("salon5"); }),
    ]);
    expect(log).toEqual(["salon5", "salon4"]);
  });

  it("releases the lock when the work throws, so the next one still runs", async () => {
    await expect(withTurnLock(6, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await withTurnLock(6, async () => "after")).toBe("after");
    expect(state.open).toBe(0);
  });
});
