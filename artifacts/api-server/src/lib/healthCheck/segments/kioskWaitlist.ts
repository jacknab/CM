import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, rollup } from "../types";

export async function kioskWaitlist(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];

  const settingsRes = await pool.query(
    `SELECT preferences FROM store_settings WHERE store_id = $1`,
    [accountId],
  );
  let prefs: Record<string, unknown> = {};
  if (settingsRes.rows[0]?.preferences) {
    try { prefs = JSON.parse(settingsRes.rows[0].preferences); } catch {}
  }

  // Kiosk
  const kioskEnabled = !!prefs.kioskEnabled;
  const kioskSlug = prefs.kioskSlug as string | undefined;

  let kioskCheckins30 = 0;
  if (kioskEnabled) {
    try {
      const kioskRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM kiosk_checkins
         WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [accountId],
      );
      kioskCheckins30 = Number(kioskRes.rows[0]?.cnt ?? 0);
    } catch {
      // Table may not exist in all environments
    }
  }

  checks.push(pass(
    "kiosk",
    "Kiosk check-in",
    kioskEnabled
      ? `Kiosk enabled${kioskSlug ? ` — /kiosk/${kioskSlug}` : ""} | ${kioskCheckins30} check-in${kioskCheckins30 !== 1 ? "s" : ""} in last 30 days`
      : "Kiosk check-in is disabled (informational).",
  ));

  // Waitlist
  const waitlistEnabled = !!prefs.waitlistEnabled;
  let waitlistEntries7 = 0;
  if (waitlistEnabled) {
    try {
      const wRes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM waitlist_entries
         WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
        [accountId],
      );
      waitlistEntries7 = Number(wRes.rows[0]?.cnt ?? 0);
    } catch {
      // Table may not exist
    }
  }

  checks.push(pass(
    "waitlist",
    "Waitlist",
    waitlistEnabled
      ? `Waitlist enabled | ${waitlistEntries7} entr${waitlistEntries7 !== 1 ? "ies" : "y"} in last 7 days`
      : "Waitlist is disabled (informational).",
  ));

  return {
    segmentId: "kiosk_waitlist",
    label: "Kiosk & Waitlist",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
  };
}
