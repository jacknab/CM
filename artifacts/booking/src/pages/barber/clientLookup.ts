import { clientPhoneCacheDB } from "@/lib/client-phone-cache-db";
import { syncEngine } from "@/lib/sync-engine";
import { nailOffline } from "@/lib/nail-offline";
import { hasSalonMirror } from "@/lib/salon-mirror";
import { mirrorClientIdByPhone } from "./mirrorAnswers";

/** Find a client by 10-digit phone, same as the calendar's phone sheet (falls back to the offline phone cache). */
export async function findClientId(storeId: number, digits: string): Promise<number | null> {
  const fromCache = async () => {
    // The salon's full copy on the tablet, kept in sync every minute, when it has one.
    if (await hasSalonMirror(storeId).catch(() => false)) {
      const fromCopy = await mirrorClientIdByPhone(storeId, digits).catch(() => null);
      if (fromCopy != null) return fromCopy;
    }
    const m = await clientPhoneCacheDB.findByPhone10(storeId, digits).catch(() => null);
    const id = m ? Number(m.id) : NaN;
    if (Number.isFinite(id)) return id;
    // A client made on this device while offline, not sent yet.
    const made = (await nailOffline.findClients(storeId, digits).catch(() => [] as Awaited<ReturnType<typeof nailOffline.findClients>>)).find((c) => c.phone === digits);
    return made ? made.realId ?? made.id : null;
  };
  // Not `navigator.onLine`: a tablet on Wi-Fi with the internet down still reports itself online.
  if (syncEngine.isOffline()) return fromCache();
  try {
    const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(digits)}&storeId=${storeId}`, { credentials: "include" });
    const c = await res.json().catch(() => null);
    return c && c.id ? Number(c.id) : null;
  } catch {
    syncEngine.noteUnreachable();
    return fromCache();
  }
}
