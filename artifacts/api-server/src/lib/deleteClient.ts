/**
 * Delete a client for good (Certxa Pro app, owner 2026-11-04): the row in `clients` and everything personal to it. The
 * website's "delete" (DELETE /api/clients/:id) only archives; this one can't be undone.
 *
 * Kept, with the client's link cleared: past tickets (money and tax history, which keep the client's name in
 * appointments.customer_name), gift cards (still spendable by code), reviews and booking records (they hold their own name) and the text log.
 * sms_consents is keyed by phone number and stays, so an opt-out outlives the client.
 *
 * Refused while something live depends on the client: an upcoming or running booking, or prepaid visits not yet used.
 */
import type { PoolClient } from "pg";

export type DeleteClientResult = { ok: true } | { ok: false; status: 404 | 409; message: string };

/** Run inside a transaction. */
export async function deleteClientRecord(db: PoolClient, storeId: number, clientId: number): Promise<DeleteClientResult> {
  const client = await db.query(`SELECT id FROM clients WHERE id = $1 AND store_id = $2 FOR UPDATE`, [clientId, storeId]);
  if (!client.rows[0]) return { ok: false, status: 404, message: "Client not found." };

  const upcoming = await db.query(
    `SELECT COUNT(*)::int AS n FROM appointments
      WHERE store_id = $1 AND customer_id = $2 AND (status = 'started' OR (date >= now() AND status NOT IN ('cancelled', 'completed', 'paid', 'no_show')))`,
    [storeId, clientId]);
  if (upcoming.rows[0].n > 0) {
    return { ok: false, status: 409, message: `This client has ${upcoming.rows[0].n === 1 ? "an upcoming booking" : `${upcoming.rows[0].n} upcoming bookings`}. Cancel ${upcoming.rows[0].n === 1 ? "it" : "them"} first.` };
  }
  const prepaid = await db.query(`SELECT COALESCE(SUM(visits_left), 0)::int AS n FROM client_packages WHERE store_id = $1 AND client_id = $2 AND visits_left > 0`, [storeId, clientId]);
  if (prepaid.rows[0].n > 0) {
    return { ok: false, status: 409, message: `This client has ${prepaid.rows[0].n} prepaid package ${prepaid.rows[0].n === 1 ? "visit" : "visits"} left.` };
  }

  // Past tickets keep the name as it is today.
  await db.query(
    `UPDATE appointments a SET customer_name = COALESCE(NULLIF(TRIM(COALESCE(NULLIF(c.full_name, ''), CONCAT_WS(' ', c.first_name, c.last_name))), ''), a.customer_name)
       FROM clients c WHERE c.id = a.customer_id AND a.customer_id = $1`, [clientId]);

  // No foreign key, or one that would block the delete: the link is cleared by hand.
  for (const [table, column] of [
    ["appointments", "customer_id"], ["gift_cards", "purchased_by_customer_id"], ["gift_cards", "recipient_customer_id"],
    ["reviews", "customer_id"], ["google_reviews", "customer_id"], ["review_tokens", "customer_id"], ["review_submissions", "customer_id"],
    ["sms_log", "customer_id"], ["booking_requests", "client_id"], ["booking_payment_tokens", "customer_id"],
    ["kiosk_checkins", "client_id"], ["kiosk_recommendation_events", "client_id"], ["staff_work_photos", "client_id"],
  ] as const) {
    await db.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1`, [clientId]);
  }
  // A client's photo on the website goes with their record, as when it's removed from their profile.
  await db.query(`DELETE FROM wb_gallery_photos WHERE store_id = $1 AND id IN (SELECT gallery_photo_id FROM client_photos WHERE client_id = $2)`, [storeId, clientId]);
  for (const [table, column] of [
    ["client_packages", "client_id"], ["client_photos", "client_id"], ["client_photo_permissions", "client_id"],
    ["intake_form_responses", "customer_id"], ["loyalty_transactions", "customer_id"], ["waitlist", "customer_id"],
  ] as const) {
    await db.query(`DELETE FROM ${table} WHERE ${column} = $1`, [clientId]);
  }
  // Phones, e-mails, addresses, notes, tags, preferences and the rest go with the row (ON DELETE CASCADE).
  await db.query(`DELETE FROM clients WHERE id = $1 AND store_id = $2`, [clientId, storeId]);
  return { ok: true };
}
