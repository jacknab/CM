import { pool, db } from "../db";
import { appointments, locations } from "@shared/schema";
import { eq } from "drizzle-orm";

interface NoShowApt {
  id: number;
  date: Date | string;
  duration?: number | null;
  staffId?: number | null;
}

export async function notifyKioskNoShowWaitlist(storeId: number, noShowApt: NoShowApt): Promise<void> {
  const todayStr = new Date().toISOString().split("T")[0];

  // Find the first waiting kiosk no-show waitlist entry for today
  const { rows: waitEntries } = await pool.query(
    `SELECT * FROM waitlist
     WHERE store_id = $1
       AND notes = 'kiosk_noshow_waitlist'
       AND status = 'waiting'
       AND DATE(created_at) = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [storeId, todayStr]
  );

  if (!waitEntries.length) return;

  const entry = waitEntries[0];
  const phone: string | null = entry.customer_phone ?? null;
  if (!phone) return;

  // Mark as notified immediately to prevent double-firing
  await pool.query(
    `UPDATE waitlist SET status = 'notified', notified_at = NOW(), sms_sent_at = NOW() WHERE id = $1`,
    [entry.id]
  );

  // Get store and staff info
  const [storeLoc] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, storeId));

  const staffRow = noShowApt.staffId
    ? (await pool.query(`SELECT name FROM staff WHERE id = $1`, [noShowApt.staffId])).rows[0]
    : null;
  const staffName: string | null = staffRow?.name ?? null;

  const aptDate = noShowApt.date instanceof Date ? noShowApt.date : new Date(noShowApt.date);
  const timeStr = aptDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York", // fallback — store tz would require another query
  });

  // Create a temporary pending hold appointment for the waitlisted customer
  try {
    const { rows: clientRows } = await pool.query(
      `SELECT id FROM clients WHERE phone = $1 AND store_id = $2 LIMIT 1`,
      [phone, storeId]
    );
    const holdClientId: number | null = clientRows[0]?.id ?? null;

    await db.insert(appointments).values({
      storeId,
      customerId: holdClientId,
      serviceId: null,
      date: aptDate,
      duration: noShowApt.duration ?? 30,
      status: "pending",
      staffId: noShowApt.staffId ?? null,
      depositPaid: false,
      notes: `No-show hold for ${entry.customer_name} (${phone}). Claim within 15 min.`,
    } as any);
  } catch (holdErr: any) {
    console.warn("[kiosk/noshow-waitlist] hold creation failed:", holdErr.message);
  }

  // Send SMS notification
  const storeName = storeLoc?.name ?? "the salon";
  const message = staffName
    ? `📅 A spot just opened at ${storeName}! ${staffName} is available at ${timeStr}. Come in within 15 minutes to claim it. First come, first served!`
    : `📅 A spot just opened at ${storeName} at ${timeStr}. Come in within 15 minutes to claim it. First come, first served!`;

  const { sendSms } = await import("../sms");
  await sendSms(storeId, phone, message, "kiosk_noshow_fill");

  console.log(`[kiosk/noshow-waitlist] Notified ${phone} of no-show slot at ${timeStr} (store ${storeId})`);
}
