/**
 * Seed: 7 days of test bookings for storeId=2
 * -----------------------------------------------------------------------
 * Creates a full week of realistic appointment data for staff IDs
 * 2, 24, 27, 28 so the store can be fully exercised in the UI (calendar,
 * staff schedules, reports, POS, etc).
 *
 * - Random number of bookings per staff member per day, 1–8 (never 9+).
 * - All bookings fall inside 9:00 AM – 7:00 PM MST (fixed UTC-7, no DST).
 * - Covers 7 days: 3 days back, today, and 3 days ahead — so there's a mix
 *   of completed (past) and upcoming (future) appointments to look at.
 * - Reuses the store's real, active services (random pick per booking) and
 *   creates a small pool of demo clients tagged so they're easy to find
 *   and clean up later.
 *
 * Plain Node.js — only requires `pg` (no TypeScript, no build step).
 * Run against whichever DB you point DATABASE_URL at (VPS or local):
 *
 *   DATABASE_URL=postgres://... node scripts/seed-store2-week.mjs
 *
 * On the VPS, secrets normally live in /etc/certxa.env, so:
 *
 *   set -a && source /etc/certxa.env && set +a
 *   node scripts/seed-store2-week.mjs
 *
 * Idempotent-ish: every row this script creates is tagged with
 * notes = 'Seed test data (7-day dataset)' so a follow-up cleanup script
 * can find and delete them by that marker if needed.
 */
import pg from "pg";

const { Pool } = pg;

const STORE_ID = Number(process.env.SEED_STORE_ID || 2);
const STAFF_IDS = (process.env.SEED_STAFF_IDS || "2,24,27,28")
  .split(",")
  .map((s) => Number(s.trim()));
const DAYS_BACK = 3;
const DAYS_FORWARD = 3; // total span = DAYS_BACK + today + DAYS_FORWARD = 7 days
const MAX_BOOKINGS_PER_STAFF_PER_DAY = 8; // "under 9"
const MIN_BOOKINGS_PER_STAFF_PER_DAY = 1;
const OPEN_HOUR_MST = 9; // 9:00 AM MST
const CLOSE_HOUR_MST = 19; // 7:00 PM MST
const MST_UTC_OFFSET_HOURS = 7; // fixed MST (no DST): MST = UTC-7
const SEED_TAG = "Seed test data (7-day dataset)";

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

/** Build a UTC Date for a given day offset + MST wall-clock hour/minute. */
function mstDate(dayOffsetFromToday, hour, minute) {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffsetFromToday);
  // Wall-clock MST hour -> UTC instant: UTC = MST + 7h
  return new Date(base.getTime() + (hour + MST_UTC_OFFSET_HOURS) * 3600_000 + minute * 60_000);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

const DEMO_CLIENTS = [
  ["Ava", "Martinez"], ["Liam", "Chen"], ["Sophia", "Patel"], ["Noah", "Kim"],
  ["Olivia", "Garcia"], ["Ethan", "Nguyen"], ["Mia", "Robinson"], ["Lucas", "Bennett"],
  ["Isabella", "Turner"], ["Mason", "Reyes"], ["Amelia", "Foster"], ["Logan", "Ward"],
  ["Charlotte", "Hayes"], ["James", "Coleman"], ["Harper", "Brooks"],
];

async function main() {
  console.log(`\n🗓  Seeding 7-day test dataset for storeId=${STORE_ID}...\n`);

  // ── 1. Verify the store exists ──────────────────────────────────────────
  const [store] = await q(`SELECT id, name, timezone FROM locations WHERE id = $1`, [STORE_ID]);
  if (!store) {
    console.error(`✗ No store found with id=${STORE_ID}. Aborting — refusing to invent a store.`);
    process.exit(1);
  }
  console.log(`✓ Store: ${store.name} (id ${store.id}, tz on file: ${store.timezone})`);
  console.log(`  Note: bookings are being written at fixed 9AM–7PM MST (UTC-7) as requested,`);
  console.log(`  regardless of the store's configured timezone/business hours.`);

  // ── 2. Verify staff exist and belong to this store ──────────────────────
  const staffRows = await q(
    `SELECT id, name, store_id FROM staff WHERE id = ANY($1::int[])`,
    [STAFF_IDS]
  );
  const foundIds = new Set(staffRows.map((r) => r.id));
  const missing = STAFF_IDS.filter((id) => !foundIds.has(id));
  if (missing.length) {
    console.error(`✗ Staff id(s) not found: ${missing.join(", ")}. Aborting.`);
    process.exit(1);
  }
  const mismatched = staffRows.filter((r) => r.store_id !== STORE_ID);
  if (mismatched.length) {
    console.error(
      `✗ Staff id(s) belong to a different store: ${mismatched
        .map((r) => `${r.id} (${r.name}) -> store ${r.store_id}`)
        .join(", ")}. Aborting — refusing to cross-book staff into storeId=${STORE_ID}.`
    );
    process.exit(1);
  }
  console.log(`✓ Staff verified: ${staffRows.map((r) => `${r.name} (#${r.id})`).join(", ")}`);

  // ── 3. Load active services for this store ──────────────────────────────
  const services = await q(
    `SELECT id, name, duration, price FROM services WHERE store_id = $1 AND is_active = true`,
    [STORE_ID]
  );
  if (!services.length) {
    console.error(`✗ No active services found for storeId=${STORE_ID}. Aborting — create services first.`);
    process.exit(1);
  }
  console.log(`✓ ${services.length} active service(s) available: ${services.map((s) => s.name).join(", ")}`);

  // ── 4. Create a pool of demo clients ────────────────────────────────────
  const clientIds = [];
  for (const [firstName, lastName] of DEMO_CLIENTS) {
    const fullName = `${firstName} ${lastName}`;
    const [client] = await q(
      `INSERT INTO clients (store_id, first_name, last_name, full_name, client_status, notes)
       VALUES ($1,$2,$3,$4,'active',$5)
       RETURNING id`,
      [STORE_ID, firstName, lastName, fullName, SEED_TAG]
    );
    clientIds.push(client.id);
    const phone = `+1555${String(randInt(2000000, 9999999)).padStart(7, "0")}`;
    await q(
      `INSERT INTO client_phones (client_id, store_id, phone_number_e164, phone_type)
       VALUES ($1,$2,$3,'mobile')`,
      [client.id, STORE_ID, phone]
    );
  }
  console.log(`✓ Created ${clientIds.length} demo clients`);

  // ── 5. Generate bookings per day per staff ──────────────────────────────
  let totalCreated = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let dayOffset = -DAYS_BACK; dayOffset <= DAYS_FORWARD; dayOffset++) {
    const dayDate = new Date(today.getTime() + dayOffset * 86400_000);
    const dayLabel = dayDate.toISOString().slice(0, 10);
    const isPast = dayOffset < 0;
    let dayCount = 0;

    for (const staffId of STAFF_IDS) {
      const bookingCount = randInt(MIN_BOOKINGS_PER_STAFF_PER_DAY, MAX_BOOKINGS_PER_STAFF_PER_DAY);
      const bookedIntervals = []; // [startMinuteOfDay, endMinuteOfDay] in MST wall-clock minutes

      let created = 0;
      let attempts = 0;
      const maxAttempts = bookingCount * 20;

      while (created < bookingCount && attempts < maxAttempts) {
        attempts++;
        const service = pick(services);
        const duration = service.duration || 60;

        const latestStart = CLOSE_HOUR_MST * 60 - duration;
        const earliestStart = OPEN_HOUR_MST * 60;
        if (latestStart <= earliestStart) continue; // service too long to fit — skip

        // Snap to 15-minute increments for realism.
        const slots = Math.floor((latestStart - earliestStart) / 15);
        const startMinute = earliestStart + randInt(0, slots) * 15;
        const endMinute = startMinute + duration;

        const overlaps = bookedIntervals.some(
          ([s, e]) => startMinute < e && endMinute > s
        );
        if (overlaps) continue;

        bookedIntervals.push([startMinute, endMinute]);

        const hour = Math.floor(startMinute / 60);
        const minute = startMinute % 60;
        const startAt = mstDate(dayOffset, hour, minute);

        const clientId = pick(clientIds);
        const status = isPast
          ? pick(["completed", "completed", "completed", "cancelled", "no_show"])
          : pick(["confirmed", "confirmed", "pending"]);

        await q(
          `INSERT INTO appointments
             (date, duration, status, notes, service_id, staff_id, customer_id, store_id,
              payment_policy, payment_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'none','none')`,
          [startAt.toISOString(), duration, status, SEED_TAG, service.id, staffId, clientId, STORE_ID]
        );

        created++;
        dayCount++;
        totalCreated++;
      }
    }
    console.log(`  ${dayLabel}${isPast ? " (past)" : dayOffset === 0 ? " (today)" : " (upcoming)"}: ${dayCount} bookings`);
  }

  console.log(`\n✅ Done — created ${totalCreated} appointments across ${DAYS_BACK + DAYS_FORWARD + 1} days`);
  console.log(`   for staff [${STAFF_IDS.join(", ")}] at storeId=${STORE_ID}.`);
  console.log(`   All rows tagged notes="${SEED_TAG}" for easy cleanup.\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
