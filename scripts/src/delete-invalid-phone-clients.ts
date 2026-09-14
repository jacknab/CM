/**
 * delete-invalid-phone-clients.ts
 *
 * Cycles through every client in the database and checks each of their phone
 * numbers in two free stages — a local NANP pattern check (catches
 * placeholder numbers like a 555 exchange or repeated digits, which are
 * structurally "valid" but obviously fake) and Twilio's free Lookup v2 base
 * validation (no paid add-on fields) — then PERMANENTLY DELETES any client
 * where at least one phone number on file comes back invalid.
 *
 * This is destructive and irreversible. A client with an invalid phone can
 * also have gift cards, reviews, loyalty points, SMS history, waitlist
 * entries, or intake forms — none of those tables cascade-delete in this
 * database, so this script deletes them explicitly before removing the
 * client row. Appointments have no FK constraint at all, so they're deleted
 * explicitly too rather than being left as orphaned rows.
 *
 * Safety net: before deleting anything, every affected client's full record
 * (client + phones + emails + appointments + gift cards + reviews + loyalty
 * transactions + sms log + waitlist + intake forms) is appended as one JSON
 * line to a backup file — the only recovery path if this needs to be undone.
 *
 * Each client is handled in its own transaction (backup write is outside the
 * transaction, deletes are inside) so a failure partway through doesn't leave
 * one client half-deleted; other clients are unaffected.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run delete-invalid-phone-clients
 *   pnpm --filter @workspace/scripts run delete-invalid-phone-clients -- --store-id 12
 *   pnpm --filter @workspace/scripts run delete-invalid-phone-clients -- --backup ./my-backup.jsonl
 *
 * Options:
 *   --store-id <id>   Only process clients belonging to this store (default: all stores)
 *   --backup <path>   Backup JSONL file path (default: ./deleted-clients-backup-<timestamp>.jsonl)
 *   --delay-ms <n>    Delay between Twilio calls in ms (default: 200)
 *
 * Requires DATABASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN in the environment.
 */

import pg from "pg";
import fs from "fs";
import path from "path";

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

const STORE_ID = getArg("--store-id") ? Number(getArg("--store-id")) : undefined;
const DELAY_MS = getArg("--delay-ms") ? Number(getArg("--delay-ms")) : 200;
const BACKUP_PATH = path.resolve(
  getArg("--backup") ?? `./deleted-clients-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Free local pattern check (no network call at all) ──────────────────────────
//
// Twilio's free format check only validates NANP *structure* — is the area
// code/exchange in a legal range, is the length right. It does NOT know
// whether a specific number was ever actually assigned to a subscriber, so
// obviously-fake placeholder numbers like (714) 555-6666 or (720) 222-2222
// pass it cleanly. These checks run first, entirely locally, before Twilio
// is ever called.

// The 7 NANP-wide toll-free area codes, plus 999 (unassigned/reserved) —
// none of these are ever a real person's personal phone line.
const TOLL_FREE_AND_RESERVED_NPAS: ReadonlySet<string> = new Set([
  "800", "833", "844", "855", "866", "877", "888", "999",
]);

/**
 * Zero-cost structural + pattern check for a +1 (NANP) number. Returns a
 * human-readable reason when the number should be treated as invalid, or
 * null when it looks like a normal number (still subject to the Twilio
 * Lookup check afterward). Non-NANP numbers (not +1) are left entirely to
 * Twilio's own check.
 */
function localInvalidReason(e164: string): string | null {
  if (!e164.startsWith("+1")) return null;

  // NANP structural format: [2-9][0-9]{2}-[2-9][0-9]{2}-[0-9]{4}
  const match = e164.match(/^\+1([2-9]\d{2})([2-9]\d{2})(\d{4})$/);
  if (!match) return "does not match the NANP format NXX-NXX-XXXX";

  const [, areaCode, exchange, subscriber] = match;

  if (TOLL_FREE_AND_RESERVED_NPAS.has(areaCode)) {
    return `area code ${areaCode} is toll-free/reserved, not a personal subscriber line`;
  }
  if (exchange === "555") {
    return "555 exchange code — the classic placeholder/fictional prefix";
  }
  if (/^(\d)\1{2}$/.test(exchange)) {
    return `exchange code ${exchange} is a repeated digit — placeholder pattern`;
  }
  if (/^(\d)\1{3}$/.test(subscriber)) {
    return `subscriber number ${subscriber} is a repeated digit — placeholder pattern`;
  }
  return null;
}

// ── Twilio free validation (no paid add-on fields) ─────────────────────────────

/**
 * Plain Twilio Lookup v2 request — no `Fields` query param, so this is the
 * free base check only. Returns:
 *   true  — Twilio confirms the number is valid
 *   false — Twilio confirms the number is invalid (definitive)
 *   null  — the call itself failed (network/auth/rate-limit); NOT treated as
 *           invalid, since that would delete a client over an infra hiccup
 */
async function isPhoneValid(e164: string, accountSid: string, authToken: string): Promise<boolean | null> {
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (res.status === 404) return false; // Twilio couldn't parse it at all
    if (!res.ok) {
      console.warn(`[twilio] Validation check failed for ${e164}: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { valid?: boolean };
    return body.valid ?? null;
  } catch (err: any) {
    console.warn(`[twilio] Validation check errored for ${e164}: ${err.message ?? err}`);
    return null;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: number;
  storeId: number;
  fullName: string;
}

interface PhoneRow {
  id: number;
  clientId: number;
  phoneNumberE164: string;
}

async function fetchRelated(client: pg.PoolClient, table: string, whereCol: string, id: number) {
  const { rows } = await client.query(`SELECT * FROM ${table} WHERE ${whereCol} = $1`, [id]);
  return rows;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  if (!accountSid || !authToken) {
    console.error("ERROR: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set.");
    process.exit(1);
  }

  console.log("Certxa — delete clients with an invalid phone number");
  console.log(`  Store filter : ${STORE_ID ?? "(all stores)"}`);
  console.log(`  Backup file  : ${BACKUP_PATH}`);
  console.log(`  Twilio delay : ${DELAY_MS}ms between calls`);
  console.log("");

  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const db = await pool.connect();

  let checkedClients = 0;
  let checkedPhones = 0;
  let deleted = 0;
  let inconclusive = 0;

  try {
    const clientsResult = await db.query<ClientRow>(
      `SELECT id, store_id AS "storeId", full_name AS "fullName"
         FROM clients
        WHERE archived_at IS NULL
          ${STORE_ID ? "AND store_id = $1" : ""}
        ORDER BY id`,
      STORE_ID ? [STORE_ID] : [],
    );

    console.log(`Found ${clientsResult.rows.length} client(s) to check.\n`);

    for (const clientRow of clientsResult.rows) {
      checkedClients++;

      const phonesResult = await db.query<PhoneRow>(
        `SELECT id, client_id AS "clientId", phone_number_e164 AS "phoneNumberE164"
           FROM client_phones WHERE client_id = $1`,
        [clientRow.id],
      );

      if (phonesResult.rows.length === 0) continue; // nothing to check — leave alone

      let hasInvalid = false;
      for (const phone of phonesResult.rows) {
        checkedPhones++;

        // Free local pattern check first — no network call needed to catch
        // obvious placeholder numbers (555 exchange, repeated digits,
        // toll-free/reserved area codes).
        const localReason = localInvalidReason(phone.phoneNumberE164);
        if (localReason) {
          hasInvalid = true;
          console.log(`  ✗ client ${clientRow.id} (${clientRow.fullName}) — invalid phone ${phone.phoneNumberE164} (${localReason})`);
          continue;
        }

        const valid = await isPhoneValid(phone.phoneNumberE164, accountSid, authToken);
        if (valid === false) {
          hasInvalid = true;
          console.log(`  ✗ client ${clientRow.id} (${clientRow.fullName}) — invalid phone ${phone.phoneNumberE164} (Twilio: invalid format)`);
        } else if (valid === null) {
          inconclusive++;
        }
        await sleep(DELAY_MS);
      }

      if (!hasInvalid) continue;

      // ── Backup: capture everything before it's gone ──────────────────────────
      const [clientFull] = (await db.query(`SELECT * FROM clients WHERE id = $1`, [clientRow.id])).rows;
      const backupRecord = {
        deletedAt: new Date().toISOString(),
        client: clientFull,
        phones: phonesResult.rows,
        emails: await fetchRelated(db, "client_emails", "client_id", clientRow.id),
        addresses: await fetchRelated(db, "client_addresses", "client_id", clientRow.id),
        notes: await fetchRelated(db, "client_notes", "client_id", clientRow.id),
        appointments: await fetchRelated(db, "appointments", "customer_id", clientRow.id),
        giftCardsRecipient: await fetchRelated(db, "gift_cards", "recipient_customer_id", clientRow.id),
        giftCardsPurchased: await fetchRelated(db, "gift_cards", "purchased_by_customer_id", clientRow.id),
        reviews: await fetchRelated(db, "reviews", "customer_id", clientRow.id),
        googleReviews: await fetchRelated(db, "google_reviews", "customer_id", clientRow.id),
        loyaltyTransactions: await fetchRelated(db, "loyalty_transactions", "customer_id", clientRow.id),
        smsLog: await fetchRelated(db, "sms_log", "customer_id", clientRow.id),
        waitlist: await fetchRelated(db, "waitlist", "customer_id", clientRow.id),
        intakeFormResponses: await fetchRelated(db, "intake_form_responses", "customer_id", clientRow.id),
      };
      fs.appendFileSync(BACKUP_PATH, JSON.stringify(backupRecord) + "\n");

      // ── Delete: non-cascading children first, then the client row ───────────
      try {
        await db.query("BEGIN");
        await db.query(`DELETE FROM appointments WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM gift_cards WHERE recipient_customer_id = $1 OR purchased_by_customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM reviews WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM google_reviews WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM loyalty_transactions WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM sms_log WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM waitlist WHERE customer_id = $1`, [clientRow.id]);
        await db.query(`DELETE FROM intake_form_responses WHERE customer_id = $1`, [clientRow.id]);
        // Cascades to client_addresses, client_custom_field_values, client_emails,
        // client_marketing_preferences, client_notes, client_phones,
        // client_tag_relationships, client_intelligence. Sets client_audit_logs
        // and intelligence_interventions' client reference to NULL.
        await db.query(`DELETE FROM clients WHERE id = $1`, [clientRow.id]);
        await db.query("COMMIT");
        deleted++;
        console.log(`  🗑  Deleted client ${clientRow.id} (${clientRow.fullName})\n`);
      } catch (err: any) {
        await db.query("ROLLBACK");
        console.error(`  ⚠ Failed to delete client ${clientRow.id}: ${err.message ?? err}\n`);
      }
    }

    console.log("── Summary ──────────────────────────────────────────");
    console.log(`Clients checked      : ${checkedClients}`);
    console.log(`Phone numbers checked: ${checkedPhones}`);
    console.log(`Clients deleted      : ${deleted}`);
    console.log(`Inconclusive checks  : ${inconclusive} (Twilio call failed — not treated as invalid)`);
    console.log(`Backup written to    : ${deleted > 0 ? BACKUP_PATH : "(nothing deleted, no backup written)"}`);
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
