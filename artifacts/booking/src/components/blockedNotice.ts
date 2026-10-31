/**
 * A page that is stopped (free trial ended, or the account suspended) tells the salon owner by text and e-mail
 * (POST /api/billing/blocked-notice, at most once an hour per salon) and says so to whoever is looking — staff
 * and clients, so the wording stays discreet: never "suspended", "trial" or a balance (owner, 2026-10-31).
 * Used by the blocked page (AccountStatusGate) and the /nail popup.
 */
import { useEffect, useState } from "react";

/** The line shown under "SYSTEM UNAVAILABLE": who was told, and how. */
export function useBlockedNotice(path: string, enabled = true): string {
  const [reached, setReached] = useState<{ sms: boolean; email: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setReached(null);
    fetch("/api/billing/blocked-notice", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setReached({ sms: !!d?.sms, email: !!d?.email }); })
      .catch(() => { if (live) setReached({ sms: false, email: false }); });
    return () => { live = false; };
  }, [path, enabled]);
  if (reached === null) return "Please check back later.";
  if (reached.sms && reached.email) return "The salon owner has been notified by text and e-mail.";
  if (reached.sms) return "The salon owner has been notified by text.";
  if (reached.email) return "The salon owner has been notified by e-mail.";
  return "Please let the salon owner know.";
}
