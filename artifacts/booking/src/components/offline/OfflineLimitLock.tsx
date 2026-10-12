import { useEffect, useState } from "react";
import { syncEngine } from "@/lib/sync-engine";

/**
 * Covers the screen once the device has gone longer than it is allowed to without reaching the server
 * (12 hours). Nothing saved on the device is removed: it is sent as soon as the connection is back, and the
 * cover lifts by itself.
 */
export function OfflineLimitLock() {
  const [locked, setLocked] = useState(() => syncEngine.offlineTooLong());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const check = () => setLocked(syncEngine.offlineTooLong());
    check();
    const timer = window.setInterval(check, 30_000);
    const off = syncEngine.onStatusChange(check);
    return () => { window.clearInterval(timer); off(); };
  }, []);

  if (!locked) return null;

  const tryAgain = async () => {
    setChecking(true);
    await syncEngine.checkNow();
    setLocked(syncEngine.offlineTooLong());
    setChecking(false);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="offline-limit-title"
      data-testid="offline-limit-lock"
      style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#14171c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}
    >
      <div style={{ maxWidth: 560, textAlign: "center" }}>
        <h2 id="offline-limit-title" style={{ fontSize: 30, fontWeight: 700, margin: "0 0 16px" }}>
          Connect to the internet to continue
        </h2>
        <p style={{ fontSize: 18, lineHeight: 1.5, color: "#cbd5e1", margin: "0 0 12px" }}>
          This tablet has been offline for more than 12 hours.
        </p>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: "#94a3b8", margin: "0 0 28px" }}>
          Everything saved on this tablet is safe. It will be sent, and this screen will open again, as soon as the
          tablet is back online.
        </p>
        <button
          type="button"
          onClick={tryAgain}
          disabled={checking}
          style={{ fontSize: 18, fontWeight: 700, padding: "14px 32px", borderRadius: 12, border: "none", background: "#0d9bd1", color: "#fff", opacity: checking ? 0.6 : 1 }}
        >
          {checking ? "Checking…" : "Try again"}
        </button>
      </div>
    </div>
  );
}
