import { getRedisClient } from "./redis";

export interface LocalHubCandidate {
  registerId: number;
  address: string;
  seenAt: string;
}

export function chooseLocalHubHost(
  candidates: LocalHubCandidate[],
  defaultRegisterId: number | undefined,
  currentHostRegisterId: number | null | undefined,
): LocalHubCandidate | null {
  if (!candidates.length) return null;
  return candidates.find((candidate) => candidate.registerId === defaultRegisterId)
    ?? candidates.find((candidate) => candidate.registerId === currentHostRegisterId)
    ?? candidates.reduce((latest, candidate) =>
      Date.parse(candidate.seenAt) > Date.parse(latest.seenAt) ? candidate : latest);
}

/**
 * Each POS station's latest check-in, kept in Redis (shared by every API worker) rather than in the salon's
 * settings row: that row is copied to every tablet whenever it changes, and stations check in every minute.
 * Without Redis, this worker's own memory.
 */
const leasesInMemory = new Map<number, Map<number, LocalHubCandidate>>();
const leaseKey = (storeId: number) => `localhub:leases:${storeId}`;

/** Records one station's check-in and returns every station's latest one (fresh or not). */
export async function recordLocalHubLease(storeId: number, lease: LocalHubCandidate): Promise<LocalHubCandidate[]> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const key = leaseKey(storeId);
      const out = await redis.multi().hset(key, String(lease.registerId), JSON.stringify(lease)).expire(key, 600).hgetall(key).exec();
      const all = out?.[2]?.[1] as Record<string, string> | undefined;
      if (all) {
        return Object.values(all).flatMap((v) => {
          try { return [JSON.parse(v) as LocalHubCandidate]; } catch { return []; }
        });
      }
    } catch { /* Redis hiccup — this worker's own memory below */ }
  }
  const leases = leasesInMemory.get(storeId) ?? new Map<number, LocalHubCandidate>();
  leases.set(lease.registerId, lease);
  leasesInMemory.set(storeId, leases);
  return [...leases.values()];
}
