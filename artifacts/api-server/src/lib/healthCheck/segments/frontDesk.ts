import type { Pool } from "pg";
import type { CheckResult, SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";

/**
 * Front Desk (POS) — what the /nail (nail salons) and /barber (barbershops) screens depend on (owner, 2026-11-03):
 * Front Desk Setup, card payments, cash drawers per POS station, open drawer sessions (Day Close), manager PIN,
 * Tech IDs, the turn line, customer screens and the tablets' offline health. Only real problems are flagged.
 */
export async function frontDesk(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks: CheckResult[] = [];
  const tables: Record<string, unknown[]> = {};
  const done = (): SegmentResult => ({
    segmentId: "front_desk", label: "Front Desk (POS)", status: rollup(checks), runAt: new Date().toISOString(), checks,
    ...(Object.keys(tables).length ? { tables } : {}),
  });

  const storeRes = await pool.query(
    `SELECT l.category, l.sales_tax_rate, l.tax_services_taxable, l.tax_products_taxable, u.account_type
       FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`,
    [accountId],
  );
  const store = storeRes.rows[0];
  const category = String(store?.category ?? "");
  const screen = /nail/i.test(category) ? "/nail" : /barber/i.test(category) ? "/barber" : null;
  if (store?.account_type === "certxa_pro") {
    checks.push(pass("front_desk_type", "Front desk screen", "Not used: a Certxa Pro (app) account takes payments in the app, not on /nail or /barber."));
    return done();
  }
  if (!screen) {
    checks.push(pass("front_desk_type", "Front desk screen", `Not used: /nail is for nail salons and /barber for barbershops (this account is "${category || "no business type"}").`));
    return done();
  }

  const settingsRes = await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [accountId]);
  let prefs: Record<string, any> = {};
  const raw = settingsRes.rows[0]?.preferences;
  if (raw && typeof raw === "object") prefs = raw;
  else if (typeof raw === "string") { try { prefs = JSON.parse(raw) ?? {}; } catch {} }

  // ── Front Desk Setup (the owner's login can't use the screen until it is finished) ──
  const completedAt = prefs.posSetup?.completedAt;
  if (completedAt) {
    checks.push(pass("front_desk_setup", "Front Desk Setup finished", `Finished ${new Date(completedAt).toLocaleDateString("en-US")}.`));
  } else {
    checks.push(fail("front_desk_setup", "Front Desk Setup finished", `The owner has not finished Front Desk Setup — the owner's login cannot use ${screen} until it is done.`, `Owner login → ${screen} (the setup opens by itself)`));
  }

  // ── Sales tax (a fact, not a problem: 0% can be right) ──
  const rate = Number(store?.sales_tax_rate ?? 0) * 100;
  const taxed = [store?.tax_services_taxable ? "services" : null, store?.tax_products_taxable !== false ? "retail" : null].filter(Boolean);
  checks.push(pass("sales_tax", "Sales tax", rate > 0 ? `${Number(rate.toFixed(3))}% on ${taxed.join(" and ") || "nothing"}.` : "No sales tax is charged."));

  // ── Card payments: the CARD button's provider must be able to take a card ──
  const provider = prefs.cardProvider === "own" || prefs.cardProvider === "none" ? prefs.cardProvider : "stripe";
  if (provider === "own") {
    checks.push(pass("card_payments", "Card payments", "The salon uses its own card machine (CARD records the payment)."));
  } else if (provider === "none") {
    checks.push(pass("card_payments", "Card payments", "The salon does not take cards (CARD button off)."));
  } else {
    const acct = await pool.query(
      `SELECT charges_enabled FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' ORDER BY id DESC LIMIT 1`,
      [accountId],
    );
    if (!acct.rows[0]) {
      checks.push(fail("card_payments", "Card payments", "CARD uses the Certxa card reader (Stripe M2), but no Stripe account is connected — card payments will fail.", "Settings → Payments, or POS Settings → CARD button"));
    } else if (!acct.rows[0].charges_enabled) {
      checks.push(fail("card_payments", "Card payments", "The Stripe account is connected but cannot take charges yet (Stripe needs more details) — card payments will fail.", "Settings → Payments"));
    } else {
      checks.push(pass("card_payments", "Card payments", "Certxa card reader (Stripe M2), Stripe account ready to take charges."));
    }
  }

  // ── Cash: every POS station needs a cash drawer, or it refuses cash ──
  const stations = (await pool.query(
    `SELECT r.id, r.name, r.is_default, d.id AS drawer_id, d.name AS drawer_name
       FROM registers r LEFT JOIN cash_drawers d ON d.id = r.cash_drawer_id AND d.is_active
      WHERE r.store_id = $1 AND r.is_active ORDER BY r.is_default DESC, r.sort_order, r.id`,
    [accountId],
  )).rows;
  const mainDrawer = (await pool.query(
    `SELECT id, name FROM cash_drawers WHERE store_id = $1 AND is_active AND main_station ORDER BY id LIMIT 1`,
    [accountId],
  )).rows[0];
  if (stations.length === 0) {
    if (mainDrawer) checks.push(pass("cash_drawers", "Cash drawer for each POS station", `One POS (no stations set up), using "${mainDrawer.name}".`));
    else checks.push(fail("cash_drawers", "Cash drawer for each POS station", "There is no cash drawer, so the POS refuses cash payments.", "Settings → Cash Drawers, or Front Desk Setup"));
  } else {
    const noDrawer = stations.filter((s: any) => !s.drawer_id);
    if (noDrawer.length) {
      checks.push(fail("cash_drawers", "Cash drawer for each POS station", `${noDrawer.map((s: any) => s.name).join(", ")} ${noDrawer.length === 1 ? "has" : "have"} no cash drawer, so ${noDrawer.length === 1 ? "it refuses" : "they refuse"} cash payments.`, "Settings → Cash Drawers"));
    } else {
      checks.push(pass("cash_drawers", "Cash drawer for each POS station", `${stations.length} station${stations.length === 1 ? "" : "s"}, each with a cash drawer.`));
    }
  }

  // ── Open drawer sessions: one per drawer, and Day Close keeps them short ──
  const open = (await pool.query(
    `SELECT s.id, s.drawer_id, s.opened_at, d.name AS drawer_name FROM cash_drawer_sessions s
       LEFT JOIN cash_drawers d ON d.id = s.drawer_id
      WHERE s.store_id = $1 AND s.status = 'open' ORDER BY s.opened_at`,
    [accountId],
  )).rows;
  const byDrawer = new Map<string, any[]>();
  for (const s of open) {
    const key = s.drawer_id == null ? "none" : String(s.drawer_id);
    byDrawer.set(key, [...(byDrawer.get(key) ?? []), s]);
  }
  const dupes = [...byDrawer.entries()].filter(([, list]) => list.length > 1);
  const day = (d: Date) => new Date(d).toLocaleDateString("en-US");
  if (dupes.length) {
    const what = dupes.map(([key, list]) => `${list.length} for ${key === "none" ? "no drawer" : `"${list[0].drawer_name}"`} (sessions ${list.map((s) => `#${s.id}`).join(", ")})`).join("; ");
    checks.push(fail("drawer_sessions", "Open cash drawer sessions", `More than one session is open at once: ${what}. Day Close and the Z report may count the wrong cash.`, "POS tab → Cash drawers"));
  } else {
    const stale = open.filter((s: any) => Date.now() - new Date(s.opened_at).getTime() > 48 * 3600_000);
    if (stale.length) {
      checks.push(warn("drawer_sessions", "Open cash drawer sessions", `Day Close has not run for ${stale.map((s: any) => `${s.drawer_name ? `"${s.drawer_name}"` : "the drawer"} since ${day(s.opened_at)}`).join(", ")} — the next Day Close will count every day since then.`, `${screen} → Day Close`));
    } else {
      checks.push(pass("drawer_sessions", "Open cash drawer sessions", open.length ? `${open.length} open, one per drawer, opened in the last 2 days.` : "No session open (the drawer opens by itself with the first sale of the day)."));
    }
  }

  // ── Manager PIN: 2026 is the same for every salon ──
  if (!prefs.nailScreen?.managerPinHash) {
    checks.push(warn("manager_pin", "Manager PIN changed", "The manager PIN is still 2026, the same for every Certxa salon — anyone who knows it can approve refunds and cancellations.", `${screen} → Manager → Manager PIN`));
  } else {
    checks.push(pass("manager_pin", "Manager PIN changed", "The salon has its own manager PIN."));
  }

  // ── Team: Tech IDs and the turn line ──
  const team = (await pool.query(
    `SELECT id, name, barber_number, takes_turns, employment_type FROM staff
      WHERE store_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated')`,
    [accountId],
  )).rows;
  const noId = team.filter((s: any) => s.barber_number == null);
  const idCount = new Map<number, string[]>();
  for (const s of team) if (s.barber_number != null) idCount.set(Number(s.barber_number), [...(idCount.get(Number(s.barber_number)) ?? []), s.name]);
  const sharedIds = [...idCount.entries()].filter(([, names]) => names.length > 1);
  const lockOn = prefs.nailScreen?.lockScreen !== false;
  if (noId.length || sharedIds.length) {
    const parts = [
      noId.length ? `${noId.map((s: any) => s.name).join(", ")} ${noId.length === 1 ? "has" : "have"} no Tech ID` : null,
      sharedIds.length ? sharedIds.map(([id, names]) => `ID ${id} is shared by ${names.join(" and ")}`).join("; ") : null,
    ].filter(Boolean).join("; ");
    checks.push(fail("tech_ids", "Tech IDs", `${parts}${lockOn ? " — they cannot unlock the screen" : ""}. IDs are given out when ${screen} opens.`, `${screen} (open it once), then Staff`));
  } else {
    checks.push(pass("tech_ids", "Tech IDs", `${team.length} team member${team.length === 1 ? "" : "s"}, each with their own Tech ID. Lock screen ${lockOn ? "on" : "off"}.`));
  }
  // The same rule as the turn line itself (getTurnEligibility): whoever takes turns, the owner included.
  const inLine = team.filter((s: any) => s.takes_turns !== false);
  if (inLine.length === 0) {
    checks.push(fail("turn_line", "Turn line", `Nobody on the team takes turns, so ${screen === "/barber" ? "the wait estimate and walk-in line have no barbers" : "walk-ins are never assigned"}.`, "Staff → [Member] → Takes turns"));
  } else {
    checks.push(pass("turn_line", "Turn line", `${inLine.length} take${inLine.length === 1 ? "s" : ""} turns. Turn system: ${prefs.turnSystem?.turnMode === "dollar" ? "Dollar-Based" : "Counted Turns"}${prefs.turnSystem?.turnEnabled === false ? " (auto-assign off)" : ""}.`));
  }

  // ── Customer screens (/frontdesk): optional, shown with the stations ──
  const screens = (await pool.query(
    `SELECT f.register_id, f.last_seen_at, r.name AS station, r.is_active FROM frontdesk_screens f
       LEFT JOIN registers r ON r.id = f.register_id WHERE f.store_id = $1 ORDER BY f.last_seen_at DESC NULLS LAST`,
    [accountId],
  )).rows;
  const orphan = screens.filter((s: any) => s.register_id != null && !s.is_active);
  if (orphan.length) {
    checks.push(warn("customer_screens", "Customer screens", `${orphan.length} customer screen${orphan.length === 1 ? " is" : "s are"} paired to a POS station that no longer exists, so ${orphan.length === 1 ? "it shows" : "they show"} nothing.`, `${screen} → More → Station → pair again`));
  } else {
    checks.push(pass("customer_screens", "Customer screens", screens.length ? `${screens.length} paired (see the stations table).` : "None paired (optional: tips and the card prompt then show on the POS)."));
  }
  if (stations.length) {
    tables.front_desk_stations = stations.map((s: any) => {
      const sc = screens.find((x: any) => x.register_id === s.id);
      return {
        station: `${s.name}${s.is_default ? " (main)" : ""}`,
        cashDrawer: s.drawer_name ?? null,
        customerScreen: sc ? `seen ${sc.last_seen_at ? day(sc.last_seen_at) : "never"}` : null,
      };
    });
  }

  // ── Tablets: the offline health score the server works out every 5 minutes ──
  const health = (await pool.query(`SELECT score, problems, checked_at FROM offline_health_status WHERE store_id = $1`, [accountId])).rows[0];
  if (!health) {
    checks.push(pass("tablet_health", "Front desk tablets", "No tablet has reported yet."));
  } else {
    const problems: any[] = Array.isArray(health.problems) ? health.problems : [];
    const critical = problems.filter((p) => p.severity === "critical");
    const warning = problems.filter((p) => p.severity === "warning");
    const summary = `Offline health ${health.score}/100.`;
    if (critical.length) checks.push(fail("tablet_health", "Front desk tablets", `${summary} ${critical.map((p) => p.text).join(" ")}`, "Devices tab → Run fix"));
    else if (warning.length) checks.push(warn("tablet_health", "Front desk tablets", `${summary} ${warning.map((p) => p.text).join(" ")}`, "Devices tab → Run fix"));
    else checks.push(pass("tablet_health", "Front desk tablets", `${summary} No problems.`));
  }

  return done();
}
