/**
 * Staff details → Payroll & Tax tab (owner, 2026-10-24).
 *
 *   GET /api/staff-employment/:staffId   the staff member's legal name, mailing address, dates and tax paperwork
 *   PUT /api/staff-employment/:staffId   save them
 *
 * Owner / admin / manager of the staff member's own salon only. The tax ID (SSN or EIN) and the I-9 document number
 * are stored encrypted (lib/staffTaxCrypto.ts) and never sent back — only their last 4 digits. The mailing address
 * lives in the staff table's mailing_* columns, the same ones the checks already print.
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { encryptTaxValue, taxStorageReady } from "../lib/staffTaxCrypto";

const router = Router();

/** The staff member, if the signed-in user is an owner/admin/manager of their salon. */
async function staffFor(req: Request, res: Response): Promise<{ staffId: number; storeId: number } | null> {
  const userId = (req.session as any)?.userId;
  const role = userId ? (await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1 LIMIT 1", [userId])).rows[0]?.role : null;
  if (!role || !["owner", "admin", "manager"].includes(role)) {
    res.status(403).json({ error: "Only an owner or manager can see payroll and tax details" });
    return null;
  }
  const storeId = await resolveSessionStoreId(req);
  const staffId = Number(req.params.staffId);
  if (!storeId || !Number.isInteger(staffId)) { res.status(404).json({ error: "Staff member not found" }); return null; }
  const found = await pool.query("SELECT 1 FROM staff WHERE id = $1 AND store_id = $2", [staffId, storeId]);
  if (!found.rowCount) { res.status(404).json({ error: "Staff member not found" }); return null; }
  return { staffId, storeId };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown): string | null => (typeof v === "string" && DATE.test(v) ? v : null);
const text = (v: unknown, max = 200): string | null => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};
const money = (v: unknown): string | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === "string" ? d.slice(0, 10) : null);

router.get("/:staffId", isAuthenticated, async (req, res) => {
  const who = await staffFor(req, res);
  if (!who) return;
  const [{ rows: [s] }, { rows: [e] }] = await Promise.all([
    pool.query(`SELECT name, mailing_address1, mailing_address2, mailing_city, mailing_state, mailing_zip FROM staff WHERE id = $1`, [who.staffId]),
    pool.query(`SELECT * FROM staff_employment WHERE staff_id = $1`, [who.staffId]),
  ]);
  res.json({
    storageReady: taxStorageReady(),
    legalName: e?.legal_name ?? "",
    mailingAddress1: s?.mailing_address1 ?? "", mailingAddress2: s?.mailing_address2 ?? "",
    mailingCity: s?.mailing_city ?? "", mailingState: s?.mailing_state ?? "", mailingZip: s?.mailing_zip ?? "",
    startDate: iso(e?.start_date), endDate: iso(e?.end_date),
    workerType: e?.worker_type ?? null,
    taxIdType: e?.tax_id_type ?? null, taxIdLast4: e?.tax_id_last4 ?? null,
    w4FilingStatus: e?.w4_filing_status ?? null, w4MultipleJobs: !!e?.w4_multiple_jobs,
    w4DependentsAmount: e?.w4_dependents_amount ?? null, w4OtherIncome: e?.w4_other_income ?? null,
    w4Deductions: e?.w4_deductions ?? null, w4ExtraWithholding: e?.w4_extra_withholding ?? null,
    w4Exempt: !!e?.w4_exempt, w4SignedDate: iso(e?.w4_signed_date),
    w9BusinessName: e?.w9_business_name ?? "", w9TaxClassification: e?.w9_tax_classification ?? null, w9SignedDate: iso(e?.w9_signed_date),
    i9CitizenshipStatus: e?.i9_citizenship_status ?? null, i9WorkAuthExpires: iso(e?.i9_work_auth_expires),
    i9DocumentTitle: e?.i9_document_title ?? "", i9DocumentLast4: e?.i9_document_last4 ?? null,
    i9DocumentExpires: iso(e?.i9_document_expires), i9VerifiedDate: iso(e?.i9_verified_date), i9VerifiedBy: e?.i9_verified_by ?? "",
  });
});

router.put("/:staffId", isAuthenticated, async (req, res) => {
  const who = await staffFor(req, res);
  if (!who) return;
  const b = req.body ?? {};

  const startDate = date(b.startDate), endDate = date(b.endDate);
  if (startDate && endDate && endDate < startDate) return res.status(400).json({ error: "The end date is before the start date." });

  const taxIdType = oneOf(b.taxIdType, ["ssn", "ein"] as const);
  // A new tax ID only when one was typed; otherwise the saved one stays. clearTaxId removes it.
  let taxIdEnc: string | null | undefined;
  let taxIdLast4: string | null | undefined;
  if (b.clearTaxId === true) { taxIdEnc = null; taxIdLast4 = null; }
  else if (typeof b.taxId === "string" && b.taxId.trim()) {
    const digits = b.taxId.replace(/\D/g, "");
    if (digits.length !== 9) return res.status(400).json({ error: `${taxIdType === "ein" ? "An EIN" : "A Social Security number"} has 9 digits.` });
    try { taxIdEnc = encryptTaxValue(digits); } catch (err: any) { return res.status(503).json({ error: err.message }); }
    taxIdLast4 = digits.slice(-4);
  }
  let docEnc: string | null | undefined;
  let docLast4: string | null | undefined;
  if (b.clearI9DocumentNumber === true) { docEnc = null; docLast4 = null; }
  else if (typeof b.i9DocumentNumber === "string" && b.i9DocumentNumber.trim()) {
    const doc = b.i9DocumentNumber.trim().slice(0, 40);
    try { docEnc = encryptTaxValue(doc); } catch (err: any) { return res.status(503).json({ error: err.message }); }
    docLast4 = doc.replace(/[^0-9A-Za-z]/g, "").slice(-4);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE staff SET mailing_address1 = $2, mailing_address2 = $3, mailing_city = $4, mailing_state = $5, mailing_zip = $6 WHERE id = $1`,
      [who.staffId, text(b.mailingAddress1), text(b.mailingAddress2), text(b.mailingCity, 100), text(b.mailingState, 40), text(b.mailingZip, 20)],
    );
    await client.query(
      `INSERT INTO staff_employment (staff_id, store_id) VALUES ($1, $2) ON CONFLICT (staff_id) DO NOTHING`,
      [who.staffId, who.storeId],
    );
    await client.query(
      `UPDATE staff_employment SET
         legal_name = $2, start_date = $3, end_date = $4, worker_type = $5, tax_id_type = $6,
         w4_filing_status = $7, w4_multiple_jobs = $8, w4_dependents_amount = $9, w4_other_income = $10,
         w4_deductions = $11, w4_extra_withholding = $12, w4_exempt = $13, w4_signed_date = $14,
         w9_business_name = $15, w9_tax_classification = $16, w9_signed_date = $17,
         i9_citizenship_status = $18, i9_work_auth_expires = $19, i9_document_title = $20,
         i9_document_expires = $21, i9_verified_date = $22, i9_verified_by = $23,
         updated_at = NOW(), updated_by_user_id = $24
       WHERE staff_id = $1`,
      [
        who.staffId, text(b.legalName, 120), startDate, endDate, oneOf(b.workerType, ["w2", "1099"] as const), taxIdType,
        oneOf(b.w4FilingStatus, ["single", "married_joint", "head_of_household"] as const), b.w4MultipleJobs === true,
        money(b.w4DependentsAmount), money(b.w4OtherIncome), money(b.w4Deductions), money(b.w4ExtraWithholding),
        b.w4Exempt === true, date(b.w4SignedDate),
        text(b.w9BusinessName, 160),
        oneOf(b.w9TaxClassification, ["individual", "c_corp", "s_corp", "partnership", "trust", "llc_c", "llc_s", "llc_p", "other"] as const),
        date(b.w9SignedDate),
        oneOf(b.i9CitizenshipStatus, ["citizen", "noncitizen_national", "permanent_resident", "authorized_alien"] as const),
        date(b.i9WorkAuthExpires), text(b.i9DocumentTitle, 120), date(b.i9DocumentExpires), date(b.i9VerifiedDate), text(b.i9VerifiedBy, 120),
        String((req.session as any)?.userId ?? ""),
      ],
    );
    if (taxIdEnc !== undefined) {
      await client.query(`UPDATE staff_employment SET tax_id_enc = $2, tax_id_last4 = $3 WHERE staff_id = $1`, [who.staffId, taxIdEnc, taxIdLast4]);
    }
    if (docEnc !== undefined) {
      await client.query(`UPDATE staff_employment SET i9_document_number_enc = $2, i9_document_last4 = $3 WHERE staff_id = $1`, [who.staffId, docEnc, docLast4]);
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[staff-employment] save failed:", (err as Error).message);
    res.status(500).json({ error: "Couldn't save the payroll and tax details" });
  } finally {
    client.release();
  }
});

export default router;
