import { useEffect } from "react";
import { getDeviceId } from "@/lib/device-id";

/**
 * Reports this terminal's IP so /kiosk and /frontdesk can optionally be restricted to the salon's own
 * network (Kiosk Settings). Only the first device to ever report for a store becomes the trusted
 * "anchor" (see api-server lib/salonNetworkGuard.ts), so every staff screen can call this
 * unconditionally — it's a no-op for any device that isn't the anchor. Fires on load, then keeps the
 * anchor's IP fresh for as long as the screen stays open (normally all day).
 */
export function useStoreNetworkReport(storeId: number | undefined) {
  useEffect(() => {
    if (!storeId) return;
    const report = () => {
      fetch("/api/store-network/report", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      }).catch(() => {});
    };
    report();
    const iv = setInterval(report, 10 * 60_000);
    return () => clearInterval(iv);
  }, [storeId]);
}
