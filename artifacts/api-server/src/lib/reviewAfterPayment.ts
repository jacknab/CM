/**
 * Certxa Pro (the solo app): the review text goes out as soon as a visit is paid — Mark as paid or a card payment —
 * not 30 to 90 minutes later like a salon's (owner, 2026-11-03: a solo pro's client has usually just left).
 * Everything else is the usual review text (sms.ts sendReviewRequest): the shop's switch, its every-N-visits rule,
 * opt-outs, and once per visit — so the scheduled job never sends a second one.
 */
import { pool } from "../db";
import { isProAccount } from "@shared/proAccount";

export async function reviewRightAfterPayment(appointmentId: number): Promise<void> {
  try {
    const owner = (await pool.query(
      `SELECT u.account_type FROM appointments a JOIN locations l ON l.id = a.store_id JOIN users u ON u.id = l.user_id
        WHERE a.id = $1 AND a.status = 'completed'`, [appointmentId])).rows[0];
    if (!owner || !isProAccount(owner.account_type)) return;
    const { storage } = await import("../storage");
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) return;
    const { sendReviewRequest } = await import("../sms");
    const r = await sendReviewRequest(appt as any);
    if (!r.sent) console.log(`[review] Pro visit ${appointmentId}: no review text — ${r.reason}`);
  } catch (err: any) {
    console.warn(`[review] Pro visit ${appointmentId}:`, err?.message ?? err);
  }
}
