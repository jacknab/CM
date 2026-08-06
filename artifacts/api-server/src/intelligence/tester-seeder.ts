/**
 * tester-seeder.ts
 *
 * Inline demo data seeder for tester accounts.
 * Seeds realistic appointment history directly into an existing store (by storeId),
 * without creating a new user or store record.
 *
 * Works by:
 *   1. Clearing existing customers + appointments for the store
 *   2. Using the store's existing services (or creating generic ones if none exist)
 *   3. Using the store's existing staff (or creating generic ones if none exist)
 *   4. Seeding ~200 clients across 8 archetypes needed to showcase all intelligence engines
 */

import { db } from "../db";
import {
  appointments,
  services,
  serviceCategories,
  staff,
  staffServices,
  appointmentAddons,
  clients,
  clientEmails,
  clientPhones,
  clientAddresses,
  clientNotes,
  clientTags,
  clientTagRelationships,
  clientMarketingPreferences,
  clientAuditLogs,
} from "../../shared/schema";
import {
  clientIntelligence,
  staffIntelligence,
  growthScoreSnapshots,
  deadSeatPatterns,
  intelligenceInterventions,
} from "../../shared/schema/intelligence";
import { eq, inArray } from "drizzle-orm";

// ─── Helpers ────────────────────────────────────────────────────────────────

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d;
}
function daysFromNow(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() + n); return d;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function withHour(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date); d.setHours(hour, minute, 0, 0); return d;
}

const FEMALE_FIRST = [
  "Emma","Olivia","Sophia","Isabella","Mia","Ava","Charlotte","Amelia",
  "Harper","Evelyn","Abigail","Emily","Elizabeth","Mila","Ella","Sofia",
  "Camila","Aria","Scarlett","Victoria","Madison","Luna","Grace","Chloe",
  "Penelope","Layla","Riley","Zoey","Nora","Lily","Eleanor","Hannah",
  "Lillian","Addison","Aubrey","Ellie","Stella","Natalie","Zoe","Leah",
  "Hazel","Violet","Aurora","Savannah","Audrey","Brooklyn","Bella","Claire",
  "Skylar","Lucy","Paisley","Anna","Caroline","Nova","Emilia","Kennedy",
  "Samantha","Maya","Willow","Naomi","Elena","Sarah","Ariana","Allison",
];
const MALE_FIRST = [
  "James","John","Robert","Michael","William","David","Richard","Joseph",
  "Thomas","Charles","Christopher","Daniel","Matthew","Anthony","Mark",
  "Donald","Steven","Paul","Andrew","Joshua","Kevin","Brian","George",
  "Kenneth","Timothy","Jason","Jeffrey","Ryan","Jacob","Eric","Jonathan",
];
const LAST = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis",
  "Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson",
  "Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson",
  "White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker",
  "Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell",
];
const AREA_CODES = ["512","737","210","830","361","956","404","305","213","312"];
const EMAIL_DOMAINS = ["gmail.com","yahoo.com","icloud.com","hotmail.com","outlook.com","me.com"];

function randomPhone(): string {
  const ac = pick(AREA_CODES);
  return `(${ac}) ${rng(200,999)}-${rng(1000,9999).toString().padStart(4,"0")}`;
}
function randomEmail(first: string, last: string): string {
  const n = rng(0,99);
  return `${first.toLowerCase()}${last.toLowerCase()}${n > 50 ? n : ""}@${pick(EMAIL_DOMAINS)}`;
}

// ─── Generic fallback services if the store has none ──────────────────────

const GENERIC_SERVICES = [
  { name: "Classic Service",       price: "35.00", duration: 30 },
  { name: "Deluxe Service",        price: "55.00", duration: 45 },
  { name: "Premium Package",       price: "80.00", duration: 60 },
  { name: "Express Treatment",     price: "25.00", duration: 20 },
  { name: "Full Treatment",        price: "100.00", duration: 75 },
  { name: "Maintenance Service",   price: "45.00", duration: 40 },
];

// ─── Generic fallback staff if the store has none ─────────────────────────

const GENERIC_STAFF = [
  { name: "Alex Chen",    role: "technician", color: "#6366f1", commissionRate: "40" },
  { name: "Jordan Lee",   role: "technician", color: "#ec4899", commissionRate: "40" },
  { name: "Taylor Kim",   role: "technician", color: "#14b8a6", commissionRate: "40" },
  { name: "Morgan Davis", role: "technician", color: "#f59e0b", commissionRate: "40" },
];

// ─── Appointment row type ─────────────────────────────────────────────────

type ApptStatus = "completed" | "cancelled" | "no-show" | "confirmed" | "pending";

type ApptRow = {
  date:          Date;
  duration:      number;
  status:        ApptStatus;
  serviceId:     number;
  staffId:       number;
  customerId:    number;
  storeId:       number;
  totalPaid:     string | null;
  paymentMethod: string | null;
  notes:         null;
};

function makeAppt(
  date: Date, svcId: number, svcPrice: number, svcDur: number,
  staffId: number, customerId: number, storeId: number,
  status: ApptStatus
): ApptRow {
  const isPast = date < new Date();
  const effectiveStatus: ApptStatus = isPast && status === "confirmed" ? "completed" : status;
  let totalPaid: string | null = null;
  let paymentMethod: string | null = null;
  if (effectiveStatus === "completed") {
    const tip = rng(0,3) === 0 ? rng(3,20) : 0;
    totalPaid = (svcPrice + tip).toFixed(2);
    paymentMethod = pick(["card","cash","card","card","card"]);
  }
  return { date, duration: svcDur, status: effectiveStatus, serviceId: svcId,
           staffId, customerId, storeId, totalPaid, paymentMethod, notes: null };
}

interface SvcRef { id: number; price: number; duration: number; }

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedTesterStore(
  storeId: number,
  send: (data: object) => void
): Promise<void> {
  const log = (line: string) => send({ phase: "seed", status: "progress", logLine: line });

  log("[SEED] ══════════════════════════════════════════════════");
  log("[SEED] Preparing demo intelligence data for your store…");
  log("[SEED] ══════════════════════════════════════════════════");

  // ── Step 1: Clear existing demo-sensitive data ───────────────────────────
  log("[SEED] Clearing existing clients & appointments…");

  const apptIds = (await db.select({ id: appointments.id }).from(appointments)
    .where(eq(appointments.storeId, storeId))).map(r => r.id);
  if (apptIds.length) {
    await db.delete(appointmentAddons).where(inArray(appointmentAddons.appointmentId, apptIds));
  }
  await db.delete(appointments).where(eq(appointments.storeId, storeId));

  // Clear clients table (new architecture) so it stays in sync
  const existingClientIds = (await db.select({ id: clients.id }).from(clients)
    .where(eq(clients.storeId, storeId))).map(r => r.id);
  if (existingClientIds.length) {
    await db.delete(clientTagRelationships).where(inArray(clientTagRelationships.clientId, existingClientIds));
    await db.delete(clientEmails).where(inArray(clientEmails.clientId, existingClientIds));
    await db.delete(clientPhones).where(inArray(clientPhones.clientId, existingClientIds));
    await db.delete(clientAddresses).where(inArray(clientAddresses.clientId, existingClientIds));
    await db.delete(clientNotes).where(inArray(clientNotes.clientId, existingClientIds));
    await db.delete(clientMarketingPreferences).where(inArray(clientMarketingPreferences.clientId, existingClientIds));
    await db.delete(clientAuditLogs).where(inArray(clientAuditLogs.clientId, existingClientIds));
  }
  await db.delete(clientTags).where(eq(clientTags.storeId, storeId));
  await db.delete(clients).where(eq(clients.storeId, storeId));

  // Clear intelligence tables so engines start from zero
  await db.delete(intelligenceInterventions).where(eq(intelligenceInterventions.storeId, storeId));
  await db.delete(clientIntelligence).where(eq(clientIntelligence.storeId, storeId));
  await db.delete(staffIntelligence).where(eq(staffIntelligence.storeId, storeId));
  await db.delete(growthScoreSnapshots).where(eq(growthScoreSnapshots.storeId, storeId));
  await db.delete(deadSeatPatterns).where(eq(deadSeatPatterns.storeId, storeId));

  log("[SEED] ✓ Existing data cleared");

  // ── Step 2: Ensure services exist ────────────────────────────────────────
  let svcList: SvcRef[] = (await db.select({ id: services.id, price: services.price, duration: services.duration })
    .from(services).where(eq(services.storeId, storeId)))
    .map(s => ({ id: s.id, price: parseFloat(s.price || "0"), duration: s.duration || 30 }));

  if (svcList.length === 0) {
    log("[SEED] No services found — creating generic service catalogue…");
    const [cat] = await db.insert(serviceCategories).values({
      name: "Services", storeId,
    }).returning();
    for (const svc of GENERIC_SERVICES) {
      const [row] = await db.insert(services).values({
        name: svc.name, price: svc.price, duration: svc.duration,
        storeId, category: "Services", categoryId: cat.id,
        description: svc.name,
      }).returning();
      svcList.push({ id: row.id, price: parseFloat(svc.price), duration: svc.duration });
    }
    log(`[SEED] ✓ Created ${svcList.length} services`);
  } else {
    log(`[SEED] ✓ Using ${svcList.length} existing services`);
  }

  // ── Step 3: Ensure staff exist ────────────────────────────────────────────
  let staffIds: number[] = (await db.select({ id: staff.id }).from(staff)
    .where(eq(staff.storeId, storeId))).map(r => r.id);

  if (staffIds.length === 0) {
    log("[SEED] No staff found — creating demo team…");
    for (const s of GENERIC_STAFF) {
      const [row] = await db.insert(staff).values({
        name: s.name, storeId, role: s.role, color: s.color,
        commissionEnabled: true, commissionRate: s.commissionRate, status: "active",
      }).returning();
      staffIds.push(row.id);
      for (const svc of svcList) {
        await db.insert(staffServices).values({ staffId: row.id, serviceId: svc.id }).catch(() => {});
      }
    }
    log(`[SEED] ✓ Created ${staffIds.length} staff members`);
  } else {
    log(`[SEED] ✓ Using ${staffIds.length} existing staff`);
  }

  // ── Build service pools (split into frequency tiers) ─────────────────────
  const sorted = [...svcList].sort((a, b) => b.price - a.price);
  const q = Math.ceil(sorted.length / 4);
  const highFreq  = sorted.slice(0, q).length     ? sorted.slice(0, q)     : svcList;
  const medFreq   = sorted.slice(q, q*2).length   ? sorted.slice(q, q*2)   : svcList;
  const monthly   = sorted.slice(q*2, q*3).length ? sorted.slice(q*2, q*3) : svcList;
  const occ       = sorted.slice(q*3).length      ? sorted.slice(q*3)      : svcList;

  const busyHour = () => pick([10,11,12,13,14,15,16,17]);
  const deadHour = () => pick([9,18]);

  const allAppts: ApptRow[] = [];
  const firstNames = [...FEMALE_FIRST, ...MALE_FIRST];

  async function mkCustomer(fn: string, ln: string, birthday?: string): Promise<number> {
    const phone = randomPhone();
    const email = randomEmail(fn, ln);
    const [c] = await db.insert(clients).values({
      storeId,
      firstName: fn,
      lastName: ln,
      fullName: `${fn} ${ln}`,
      dateOfBirth: birthday ?? null,
      loyaltyPoints: rng(0, 400),
      clientStatus: "active",
      source: "seeded",
    }).returning();
    const digits = phone.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    await db.insert(clientPhones).values({
      clientId: c.id,
      phoneNumberE164: e164,
      displayPhone: phone,
      phoneType: "mobile",
      smsOptIn: true,
      isPrimary: true,
      storeId,
    } as any).onConflictDoNothing();
    await db.insert(clientEmails).values({
      clientId: c.id,
      emailAddress: email,
      isPrimary: true,
      verified: false,
      marketingOptIn: Math.random() > 0.15,
    }).onConflictDoNothing();
    return c.id;
  }

  // ── Archetype A: Loyal monthly-plus clients (50) ─────────────────────────
  // Real-world: these are the best clients — hair colour every 6 weeks, massage
  // every 3-4 weeks, waxing every 4 weeks. Nobody goes more than once in 3 weeks.
  // Cadence: 21–30 days. Jitter: ±4 days max (floor enforced at 21 days).
  log("[SEED] Seeding loyal frequent clients…");
  for (let i = 0; i < 50; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const bd = `${rng(1975,2000)}-${String(rng(1,12)).padStart(2,"0")}-${String(rng(1,28)).padStart(2,"0")}`;
    const cId = await mkCustomer(fn, ln, bd);
    const preferredStaff = staffIds[rng(0, Math.min(2, staffIds.length - 1))];
    const cadenceDays = rng(21, 30);
    const totalVisits = rng(6, 12);
    let visitDate = daysAgo(cadenceDays * totalVisits + rng(0, 14));
    for (let v = 0; v < totalVisits; v++) {
      const svc = pick(highFreq);
      const d = withHour(new Date(visitDate), busyHour(), pick([0,15,30,45]));
      if (d > new Date()) { visitDate = addDays(visitDate, cadenceDays); continue; }
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, preferredStaff, cId, storeId,
        Math.random() < 0.05 ? "no-show" : "completed"));
      // Jitter: +0 to +9 days only — never negative, so gaps can't fall below cadence
      visitDate = addDays(visitDate, cadenceDays + rng(0, 9));
    }
    if (Math.random() > 0.25) {
      const svc = pick(highFreq);
      allAppts.push(makeAppt(withHour(daysFromNow(rng(3,21)), busyHour(), 0),
        svc.id, svc.price, svc.duration, preferredStaff, cId, storeId, "confirmed"));
    }
  }

  // ── Archetype B: Regular clients (80) ────────────────────────────────────
  // Real-world: come every 5–7 weeks. Might shift a week either side.
  // Cadence: 35–50 days. Jitter: -5 to +10 days (floor: 30 days).
  log("[SEED] Seeding regular clients…");
  for (let i = 0; i < 80; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const staffPref = staffIds[rng(0, staffIds.length - 1)];
    const cadenceDays = rng(35, 50);
    const totalVisits = rng(4, 8);
    let visitDate = daysAgo(cadenceDays * totalVisits + rng(0, 21));
    for (let v = 0; v < totalVisits; v++) {
      const svc = pick(medFreq);
      const d = withHour(new Date(visitDate), busyHour(), pick([0, 30]));
      if (d > new Date()) { visitDate = addDays(visitDate, cadenceDays); continue; }
      const ns = Math.random() < 0.07;
      const cn = !ns && Math.random() < 0.06;
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, staffPref, cId, storeId,
        ns ? "no-show" : cn ? "cancelled" : "completed"));
      // Allow ±5 days jitter but enforce minimum 30-day gap
      const jitter = rng(-5, 10);
      visitDate = addDays(visitDate, Math.max(30, cadenceDays + jitter));
    }
    if (Math.random() > 0.4) {
      const svc = pick(medFreq);
      allAppts.push(makeAppt(withHour(daysFromNow(rng(5,35)), busyHour(), 0),
        svc.id, svc.price, svc.duration, staffPref, cId, storeId, "confirmed"));
    }
  }

  // ── Archetype C: True monthly clients (60) ───────────────────────────────
  // Real-world: once a month, roughly. Sometimes 5 weeks, sometimes 7.
  // Cadence: 30–45 days. Jitter: +0 to +14 days (never negative — they always
  // stretch a bit, never come early).
  log("[SEED] Seeding monthly clients…");
  for (let i = 0; i < 60; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const bd = `${rng(1970,1995)}-${String(rng(1,12)).padStart(2,"0")}-${String(rng(1,28)).padStart(2,"0")}`;
    const cId = await mkCustomer(fn, ln, bd);
    const cadenceDays = rng(30, 45);
    const totalVisits = rng(3, 7);
    let visitDate = daysAgo(cadenceDays * totalVisits + rng(0, 14));
    for (let v = 0; v < totalVisits; v++) {
      const svc = pick(monthly);
      const d = withHour(new Date(visitDate), rng(10,16), 0);
      if (d > new Date()) { visitDate = addDays(visitDate, cadenceDays); continue; }
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId,
        Math.random() < 0.08 ? "no-show" : "completed"));
      // Monthly clients drift later, never earlier
      visitDate = addDays(visitDate, cadenceDays + rng(0, 14));
    }
  }

  // ── Archetype D: Occasional clients (50) ─────────────────────────────────
  // Real-world: every 2–3 months. Special occasions, seasonal.
  // Cadence: 55–80 days. Jitter: ±10 days.
  log("[SEED] Seeding occasional clients…");
  for (let i = 0; i < 50; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const cadenceDays = rng(55, 80);
    const totalVisits = rng(2, 4);
    let visitDate = daysAgo(cadenceDays * totalVisits + rng(0, 21));
    for (let v = 0; v < totalVisits; v++) {
      const svc = pick(occ);
      const d = withHour(new Date(visitDate), rng(11,17), 0);
      if (d > new Date()) { visitDate = addDays(visitDate, cadenceDays); continue; }
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId,
        Math.random() < 0.1 ? "cancelled" : "completed"));
      visitDate = addDays(visitDate, cadenceDays + rng(-10, 15));
    }
  }

  // ── Archetype E: DRIFTING clients (40) ★ triggers drift + churn engines ──
  // Real-world: used to come every 4–6 weeks on a reliable cadence, but their
  // last visit was 1.5–2× their normal window ago. No future booking.
  // Cadence: 28–42 days. Jitter: +0 to +5 days only (they were punctual before).
  log("[SEED] Seeding drifting clients (drift engine)…");
  for (let i = 0; i < 40; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const staffPref = staffIds[rng(0, staffIds.length - 1)];
    const cadenceDays = pick([28, 28, 35, 35, 42, 42]);
    const regularVisits = rng(3, 7);
    // Last visit was 1.5–2× their normal cadence ago — that's what makes them "drifting"
    const lastVisitDaysAgo = Math.round(cadenceDays * rng(15, 20) / 10);
    let visitDate = daysAgo(lastVisitDaysAgo + cadenceDays * (regularVisits - 1));
    for (let v = 0; v < regularVisits; v++) {
      const svc = pick(v < regularVisits - 1 ? highFreq : medFreq);
      const d = withHour(new Date(visitDate), busyHour(), 0);
      if (d > new Date()) break;
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, staffPref, cId, storeId,
        Math.random() < 0.05 ? "no-show" : "completed"));
      if (v < regularVisits - 1) visitDate = addDays(visitDate, cadenceDays + rng(0, 5));
    }
    // NO future appointment — that's what defines drifting
  }

  // ── Archetype F: New clients (35) ─────────────────────────────────────────
  // Real-world: 1–3 visits in the last 8 weeks. Each visit at least 3 weeks
  // after the previous one. Cumulative dating prevents close-together visits.
  log("[SEED] Seeding new clients…");
  for (let i = 0; i < 35; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const numVisits = rng(1, 3);
    // Work backwards from most recent visit, ensuring 21+ day spacing
    const mostRecentDaysAgo = rng(3, 21);
    let daysBack = mostRecentDaysAgo;
    for (let v = 0; v < numVisits; v++) {
      const svc = pick([...medFreq, ...occ]);
      const d = withHour(daysAgo(daysBack), busyHour(), 0);
      if (d > new Date()) continue;
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "completed"));
      // Each prior visit was 21–35 days before the next one
      daysBack += rng(21, 35);
    }
    if (Math.random() > 0.5) {
      const svc = pick(medFreq);
      allAppts.push(makeAppt(withHour(daysFromNow(rng(7,21)), busyHour(), 0),
        svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "confirmed"));
    }
  }

  // ── Archetype G: Lapsed / churned clients (35) ★ triggers leakage report ─
  // Real-world: were monthly-ish clients (28–42 day cadence) but last visited
  // 4–6 months ago. The engine flags them as revenue leakage.
  // Cadence: 28–42 days. Jitter: +0 to +7 days (they were stretching before they left).
  log("[SEED] Seeding lapsed clients (revenue leakage engine)…");
  for (let i = 0; i < 35; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const cadenceDays = pick([28, 35, 42]);
    const totalVisits = rng(4, 8);
    const lastVisitDaysAgo = rng(120, 180);
    let visitDate = daysAgo(lastVisitDaysAgo + cadenceDays * (totalVisits - 1));
    for (let v = 0; v < totalVisits; v++) {
      const svc = pick([...highFreq, ...medFreq]);
      const d = withHour(new Date(visitDate), busyHour(), 0);
      if (d > new Date()) break;
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "completed"));
      visitDate = addDays(visitDate, cadenceDays + rng(0, 7));
    }
  }

  // ── Archetype H: No-show prone (25) ★ triggers no-show risk engine ────────
  // Real-world: book regularly (every 3–6 weeks) but miss 25–45% of bookings.
  // Minimum advance between visits: 21 days.
  log("[SEED] Seeding no-show-prone clients (no-show risk engine)…");
  for (let i = 0; i < 25; i++) {
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    const totalAppts = rng(4, 10);
    const nsRate = rng(25, 45) / 100;
    let visitDate = daysAgo(rng(60, 180));
    for (let v = 0; v < totalAppts; v++) {
      const svc = pick(occ);
      const d = withHour(new Date(visitDate), rng(9,18), 0);
      if (d > new Date()) { visitDate = addDays(visitDate, rng(21, 42)); continue; }
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId,
        Math.random() < nsRate ? "no-show" : "completed"));
      visitDate = addDays(visitDate, rng(21, 45));
    }
    if (Math.random() > 0.35) {
      const svc = pick(occ);
      allAppts.push(makeAppt(withHour(daysFromNow(rng(1,7)), rng(9,18), 0),
        svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "confirmed"));
    }
  }

  // ── Dead-seat thinned slots (sparse bookings in off-peak hours) ───────────
  log("[SEED] Adding dead-seat pattern data…");
  for (let week = 0; week < 20; week++) {
    const svc = pick(occ);
    const fn = pick(firstNames), ln = pick(LAST);
    const cId = await mkCustomer(fn, ln);
    if (rng(0,2) === 0) {
      const d = daysAgo(week * 7 + rng(0,2));
      d.setHours(deadHour(), 0, 0, 0);
      allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "completed"));
    }
  }

  // ── Upcoming confirmed appointments this week ─────────────────────────────
  log("[SEED] Adding upcoming confirmed appointments…");
  const allCustIds = await db.select({ id: clients.id }).from(clients).where(eq(clients.storeId, storeId));
  const confirmedCount = Math.min(30, allCustIds.length - 5);
  for (let i = 0; i < confirmedCount; i++) {
    const cId = pick(allCustIds).id;
    const svc = pick([...medFreq, ...highFreq]);
    const day = daysFromNow(rng(1,7));
    const d = withHour(day, rng(10,17), pick([0,15,30,45]));
    allAppts.push(makeAppt(d, svc.id, svc.price, svc.duration, pick(staffIds), cId, storeId, "confirmed"));
  }

  // ── Bulk insert appointments in batches ───────────────────────────────────
  const totalClients = allCustIds.length;
  log(`[SEED] Inserting ${allAppts.length} appointments for ${totalClients} clients…`);

  const CHUNK = 150;
  let inserted = 0;
  for (let i = 0; i < allAppts.length; i += CHUNK) {
    await db.insert(appointments).values(allAppts.slice(i, i + CHUNK) as any);
    inserted += Math.min(CHUNK, allAppts.length - i);
    if (inserted % 300 === 0 || inserted >= allAppts.length) {
      log(`[SEED] … ${inserted} / ${allAppts.length} appointments written`);
    }
  }

  const completed = allAppts.filter(a => a.status === "completed").length;
  const revenue   = allAppts.filter(a => a.totalPaid)
    .reduce((s, a) => s + parseFloat(a.totalPaid!), 0);

  log(`[SEED] ══════════════════════════════════════════════════`);
  log(`[SEED] ✓ ${totalClients} clients seeded`);
  log(`[SEED] ✓ ${allAppts.length} appointments (${completed} completed)`);
  log(`[SEED] ✓ $${Math.round(revenue).toLocaleString()} historical revenue`);
  log(`[SEED] ✓ All 8 intelligence archetypes present — engines ready`);
  log(`[SEED] ══════════════════════════════════════════════════`);

}
