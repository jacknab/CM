import { describe, expect, it } from "vitest";
import { chooseLocalHubHost, recordLocalHubLease, type LocalHubCandidate } from "./localHubElection";

const candidate = (registerId: number, seenAt: string): LocalHubCandidate => ({
  registerId,
  address: `192.168.0.${registerId + 10}`,
  seenAt,
});

describe("chooseLocalHubHost", () => {
  it("prefers the salon's default POS when it has a current lease", () => {
    const backup = candidate(4, "2026-11-01T10:01:00.000Z");
    const main = candidate(3, "2026-11-01T10:00:00.000Z");

    expect(chooseLocalHubHost([backup, main], 3, 4)).toBe(main);
  });

  it("keeps the active backup host instead of switching on every heartbeat", () => {
    const current = candidate(4, "2026-11-01T10:00:00.000Z");
    const other = candidate(5, "2026-11-01T10:01:00.000Z");

    expect(chooseLocalHubHost([current, other], 3, 4)).toBe(current);
  });

  it("selects the most recently reporting station when the previous host expires", () => {
    const older = candidate(4, "2026-11-01T10:00:00.000Z");
    const newest = candidate(5, "2026-11-01T10:01:00.000Z");

    expect(chooseLocalHubHost([older, newest], 3, 3)).toBe(newest);
  });

  it("returns no host when no POS has an active lease", () => {
    expect(chooseLocalHubHost([], 3, null)).toBeNull();
  });
});

describe("recordLocalHubLease", () => {
  it("keeps each station's latest check-in, one per station", async () => {
    await recordLocalHubLease(990001, candidate(3, "2026-11-01T10:00:00.000Z"));
    await recordLocalHubLease(990001, candidate(4, "2026-11-01T10:00:30.000Z"));
    const all = await recordLocalHubLease(990001, candidate(3, "2026-11-01T10:01:00.000Z"));
    expect(all.map((l) => [l.registerId, l.seenAt]).sort()).toEqual([
      [3, "2026-11-01T10:01:00.000Z"],
      [4, "2026-11-01T10:00:30.000Z"],
    ]);
  });
});
