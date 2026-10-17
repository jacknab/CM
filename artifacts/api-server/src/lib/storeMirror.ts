/**
 * The salon's account on its tablets: a full copy kept in the app's encrypted database and kept in sync, so the
 * /nail app works through an internet outage (plans/salon-local-database.md).
 *
 * Every table listed here has a trigger (migration 0249) that writes each insert, update and delete to
 * `store_changes` (store, table, row id, op, under one ever-increasing `seq`). A tablet copies everything once,
 * then asks for the changes after the last `seq` it applied.
 *
 * Not copied: secrets (API keys, staff PINs, payment and sign-in tokens), logs, integrations, billing, and other
 * products' tables. Columns in `omit` never leave the server. History (visits, sales, turns, time clock) goes
 * back MIRROR_HISTORY_MONTHS; older rows stay online-only.
 */
import { pool } from "../db";

export type MirrorScope = "store" | "self" | { parent: string; fk: string };
export interface MirrorTable {
  table: string;
  /** "store": has store_id. "self": the salon's own row (locations). parent: belongs to the salon through `fk`. */
  scope: MirrorScope;
  omit?: string[];
  /** Copy only rows newer than the history window, by this column (or, for a child, by its parent appointment's date). */
  since?: string;
}

export const MIRROR_HISTORY_MONTHS = 12;

export const MIRROR_TABLES: MirrorTable[] = [
  { table: "locations", scope: "self", omit: ["ein", "activation_code", "stripe_customer_id"] },
  // Clients
  { table: "clients", scope: "store", omit: ["stripe_customer_id", "stripe_payment_method_id"] },
  { table: "client_phones", scope: "store" },
  { table: "client_emails", scope: { parent: "clients", fk: "client_id" } },
  { table: "client_addresses", scope: { parent: "clients", fk: "client_id" } },
  { table: "client_marketing_preferences", scope: { parent: "clients", fk: "client_id" } },
  { table: "client_notes", scope: "store" },
  { table: "client_tags", scope: "store" },
  { table: "client_tag_relationships", scope: { parent: "clients", fk: "client_id" } },
  { table: "client_custom_fields", scope: "store" },
  { table: "client_custom_field_values", scope: { parent: "clients", fk: "client_id" } },
  // Bookings and tickets
  { table: "appointments", scope: "store", since: "date" },
  { table: "appointment_addons", scope: { parent: "appointments", fk: "appointment_id" } },
  { table: "appointment_nail_selection", scope: "store", since: "created_at" },
  { table: "booking_requests", scope: "store", since: "created_at" },
  { table: "kiosk_checkins", scope: "store", since: "created_at" },
  { table: "waitlist", scope: "store", since: "created_at" },
  // Catalogue
  { table: "service_categories", scope: "store" },
  { table: "services", scope: "store" },
  { table: "service_options", scope: { parent: "services", fk: "service_id" } },
  { table: "addons", scope: "store" },
  { table: "service_addons", scope: { parent: "services", fk: "service_id" } },
  { table: "packages", scope: "store" },
  { table: "package_items", scope: { parent: "packages", fk: "package_id" } },
  { table: "products", scope: "store" },
  { table: "nail_sizes", scope: "store" },
  { table: "nail_shapes", scope: "store" },
  { table: "nail_art_applications", scope: "store" },
  { table: "nail_art_effects", scope: "store" },
  { table: "nail_service_configs", scope: "store" },
  { table: "service_nail_sizes", scope: "store" },
  { table: "service_nail_shapes", scope: "store" },
  { table: "service_nail_art_applications", scope: "store" },
  { table: "service_nail_art_effects", scope: "store" },
  { table: "salon_resources", scope: "store" },
  // Staff, turns, time clock
  { table: "staff", scope: "store", omit: ["invite_token"] },
  { table: "staff_services", scope: { parent: "staff", fk: "staff_id" } },
  { table: "staff_availability", scope: { parent: "staff", fk: "staff_id" } },
  { table: "staff_settings", scope: "store" },
  { table: "roles", scope: "store" },
  { table: "permissions", scope: "store" },
  { table: "timeclock", scope: "store", since: "clock_in" },
  { table: "turn_events", scope: "store", since: "at" },
  { table: "turn_assignment_log", scope: "store", since: "created_at" },
  // Money
  { table: "gift_cards", scope: "store", omit: ["pin_hash"] },
  { table: "gift_card_transactions", scope: "store", since: "created_at" },
  { table: "loyalty_rewards", scope: "store" },
  { table: "loyalty_transactions", scope: "store", since: "created_at" },
  { table: "payment_refunds", scope: "store", since: "created_at" },
  { table: "cash_drawers", scope: "store" },
  { table: "cash_drawer_sessions", scope: "store", since: "opened_at" },
  { table: "registers", scope: "store", omit: ["activation_code"] },
  { table: "frontdesk_screens", scope: "store" },
  // Commission and payroll
  { table: "commission_structures", scope: "store" },
  { table: "contractors", scope: "store", omit: ["tax_id_last4", "stripe_account_id"] },
  { table: "contractor_commissions", scope: "store", since: "created_at" },
  { table: "staff_commission_accruals", scope: "store", since: "created_at" },
  { table: "pay_schedules", scope: "store" },
  { table: "payroll_runs", scope: "store", since: "created_at" },
  { table: "payroll_run_items", scope: { parent: "payroll_runs", fk: "payroll_run_id" } },
  { table: "payout_runs", scope: "store", since: "created_at" },
  { table: "payout_checks", scope: "store", since: "created_at" },
  { table: "payout_adjustments", scope: "store", since: "created_at" },
  { table: "payout_deduction_rules", scope: "store" },
  // Settings
  { table: "store_settings", scope: "store" },
  { table: "calendar_settings", scope: "store" },
  { table: "business_hours", scope: "store" },
  { table: "business_days", scope: "store", since: "created_at" },
];

const BY_NAME = new Map(MIRROR_TABLES.map((t) => [t.table, t]));
export const mirrorTable = (name: string): MirrorTable | undefined => BY_NAME.get(name);

const ident = (s: string) => `"${s.replace(/"/g, "")}"`;
const cutoffSql = `now() - interval '${MIRROR_HISTORY_MONTHS} months'`;

/** The rows of `t` that belong to the salon, as JSON without the omitted columns (the base of every query here). */
function selectRows(t: MirrorTable, alias = "r"): { from: string; where: string } {
  const omit = t.omit?.length ? ` - ARRAY[${t.omit.map((c) => `'${c}'`).join(",")}]::text[]` : "";
  const row = `(to_jsonb(${alias})${omit}) AS row, ${alias}.id AS id`;
  if (t.scope === "self") return { from: `SELECT ${row} FROM locations ${alias}`, where: `${alias}.id = $1` };
  if (t.scope === "store") {
    return { from: `SELECT ${row} FROM ${ident(t.table)} ${alias}`, where: `${alias}.store_id = $1` };
  }
  const { parent, fk } = t.scope;
  return {
    from: `SELECT ${row} FROM ${ident(t.table)} ${alias} JOIN ${ident(parent)} p ON p.id = ${alias}.${ident(fk)}`,
    where: `p.store_id = $1`,
  };
}

/** First copy: one page of a table, oldest id first, within the history window. */
export async function mirrorPage(storeId: number, t: MirrorTable, afterId: number, limit: number): Promise<{ rows: unknown[]; lastId: number | null; more: boolean }> {
  const { from, where } = selectRows(t);
  let history = "";
  if (t.since) history = ` AND r.${ident(t.since)} >= ${cutoffSql}`;
  else if (typeof t.scope === "object" && t.scope.parent === "appointments") history = ` AND p.date >= ${cutoffSql}`;
  const { rows } = await pool.query(`${from} WHERE ${where}${history} AND r.id > $2 ORDER BY r.id LIMIT $3`, [storeId, afterId, limit + 1]);
  const page = rows.slice(0, limit);
  return { rows: page.map((r: any) => r.row), lastId: page.length ? Number(page[page.length - 1].id) : null, more: rows.length > limit };
}

/** The salon's latest change number: a tablet starting a first copy applies the changes after it. */
export async function mirrorHead(storeId: number): Promise<number> {
  const { rows } = await pool.query(`SELECT COALESCE(MAX(seq), 0) AS seq FROM store_changes WHERE store_id = $1`, [storeId]);
  return Number(rows[0]?.seq ?? 0);
}

export interface MirrorChange { table: string; id: string; row: unknown | null }

/**
 * The salon's changes after `after`, each as the row as it is now (or null: deleted, or no longer the salon's).
 * `resync`: the log no longer reaches back that far (kept MIRROR_LOG_DAYS) — the tablet copies everything again.
 */
export const MIRROR_LOG_DAYS = 30;
export async function mirrorChanges(storeId: number, after: number, limit: number): Promise<{ changes: MirrorChange[]; last: number; more: boolean; resync: boolean }> {
  // Entries the tablet has not seen were trimmed from the log: it copies everything again.
  if (await logWasPruned(storeId, after)) return { changes: [], last: after, more: false, resync: true };
  const { rows } = await pool.query(
    `SELECT seq, tbl, row_id FROM store_changes WHERE store_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`, [storeId, after, limit + 1]);
  const page = rows.slice(0, limit);
  const last = page.length ? Number(page[page.length - 1].seq) : after;
  // The latest state of each row, once.
  const wanted = new Map<string, Set<string>>();
  for (const r of page) {
    if (!mirrorTable(r.tbl)) continue;
    (wanted.get(r.tbl) ?? wanted.set(r.tbl, new Set()).get(r.tbl)!).add(String(r.row_id));
  }
  const changes: MirrorChange[] = [];
  for (const [table, ids] of wanted) {
    const t = mirrorTable(table)!;
    const { from, where } = selectRows(t);
    const idList = [...ids].map(Number).filter(Number.isFinite);
    const { rows: current } = await pool.query(`${from} WHERE ${where} AND r.id = ANY($2::int[])`, [storeId, idList]);
    const found = new Map(current.map((c: any) => [String(c.id), c.row]));
    for (const id of ids) changes.push({ table, id, row: found.get(id) ?? null });
  }
  return { changes, last, more: rows.length > limit, resync: false };
}

/** True when entries after `after` were trimmed from the store's log (entries older than MIRROR_LOG_DAYS go nightly). */
async function logWasPruned(storeId: number, after: number): Promise<boolean> {
  const { rows } = await pool.query(`SELECT pruned_through FROM store_changes_pruned WHERE store_id = $1`, [storeId]);
  return rows.length > 0 && Number(rows[0].pruned_through) > after;
}

/** Nightly: drop log entries older than MIRROR_LOG_DAYS, remembering how far each salon's log was trimmed. */
export async function pruneMirrorLog(): Promise<void> {
  await pool.query(`
    WITH gone AS (
      DELETE FROM store_changes WHERE changed_at < now() - interval '${MIRROR_LOG_DAYS} days' RETURNING store_id, seq
    ), per_store AS (SELECT store_id, MAX(seq) AS seq FROM gone GROUP BY store_id)
    INSERT INTO store_changes_pruned (store_id, pruned_through)
    SELECT store_id, seq FROM per_store
    ON CONFLICT (store_id) DO UPDATE SET pruned_through = GREATEST(store_changes_pruned.pruned_through, EXCLUDED.pruned_through)`);
}
