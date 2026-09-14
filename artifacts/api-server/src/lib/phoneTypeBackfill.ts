/**
 * phoneTypeBackfill.ts
 *
 * Manual bulk verification of existing client_phones rows via Twilio Lookup,
 * for numbers that predate this feature or came in through a CSV import
 * (which only ever gets the free offline heuristic guess). Triggered by an
 * owner clicking "Verify phone numbers" in Settings — never runs on its own,
 * since each lookup is a paid Twilio call.
 */

import { db } from "../db";
import { clientPhones, clients } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolvePhoneType } from "./phoneTypeDetector";

// Caps cost + runtime per click (~200 * $0.008 ≈ $1.60). Call again to
// continue past this batch — the UI reports how many are still unverified.
const BATCH_SIZE = 200;

export interface PhoneTypeBackfillResult {
  checked: number;
  landlinesFound: number;
}

export async function backfillPhoneTypesForStore(storeId: number): Promise<PhoneTypeBackfillResult> {
  const batch = await db
    .select({ id: clientPhones.id, e164: clientPhones.phoneNumberE164 })
    .from(clientPhones)
    .innerJoin(clients, eq(clientPhones.clientId, clients.id))
    .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt), isNull(clientPhones.phoneTypeCheckedAt)))
    .limit(BATCH_SIZE);

  let landlinesFound = 0;

  for (const row of batch) {
    const resolved = await resolvePhoneType(row.e164);
    await db
      .update(clientPhones)
      .set({
        phoneType: resolved.phoneType,
        phoneTypeSource: resolved.source,
        phoneTypeCheckedAt: new Date(),
        carrierName: resolved.carrierName,
      })
      .where(eq(clientPhones.id, row.id));
    if (resolved.phoneType === "landline") landlinesFound++;
  }

  return { checked: batch.length, landlinesFound };
}

export async function getPhoneTypeSummaryForStore(storeId: number) {
  const rows = await db
    .select({ phoneType: clientPhones.phoneType, checkedAt: clientPhones.phoneTypeCheckedAt })
    .from(clientPhones)
    .innerJoin(clients, eq(clientPhones.clientId, clients.id))
    .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));

  const summary = { total: rows.length, verified: 0, unverified: 0, mobile: 0, voip: 0, landline: 0, unknown: 0 };
  for (const r of rows) {
    if (r.checkedAt) summary.verified++; else summary.unverified++;
    if (r.phoneType === "mobile") summary.mobile++;
    else if (r.phoneType === "voip") summary.voip++;
    else if (r.phoneType === "landline") summary.landline++;
    else summary.unknown++;
  }
  return summary;
}
