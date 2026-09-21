import { clientPhoneCacheDB } from "@/lib/client-phone-cache-db";

/** Find a client by 10-digit phone, same as the calendar's phone sheet (falls back to the offline phone cache). */
export async function findClientId(storeId: number, digits: string): Promise<number | null> {
  const fromCache = async () => {
    const m = await clientPhoneCacheDB.findByPhone10(storeId, digits).catch(() => null);
    const id = m ? Number(m.id) : NaN;
    return Number.isFinite(id) ? id : null;
  };
  if (!navigator.onLine) return fromCache();
  try {
    const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(digits)}&storeId=${storeId}`, { credentials: "include" });
    const c = await res.json().catch(() => null);
    return c && c.id ? Number(c.id) : null;
  } catch {
    return fromCache();
  }
}
