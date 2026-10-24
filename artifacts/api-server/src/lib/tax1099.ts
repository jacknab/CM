/**
 * 1099-NEC for salons' contractors (plans/1099-filing-taxbandits.md, 2026-10-24): what each contractor was paid in a tax
 * year, whether their 1099 can be filed (and what is missing), and filing a paid order through TaxBandits.
 *
 * "Paid" in a year = commission + tips + other earnings on approved payroll runs whose pay date falls in that year
 * (checks and the cash part alike), before booth rent and other deductions — box 1 of the 1099-NEC.
 */
import { pool } from "../db";
import { decryptTaxValue } from "./staffTaxCrypto";
import { createNec, transmitNec, necStatus, updateNec, type CopyDelivery, type Payer, type Recipient } from "./taxbandits";

/** The amount from which a contractor needs a 1099-NEC: $2,000 for payments made in 2026 on, $600 before. */
export const necThreshold = (taxYear: number) => (taxYear >= 2026 ? 2000 : 600);

export const PRICE_PER_FORM_CENTS = () => Number(process.env.TAX_1099_PRICE_CENTS) || 800;
export const MAIL_PER_FORM_CENTS = () => Number(process.env.TAX_1099_MAIL_CENTS) || 300;

export interface ContractorYear {
  staffId: number;
  name: string;
  legalName: string | null;
  workerType: string | null;
  amount: number;
  overThreshold: boolean;
  missing: string[];
  ready: boolean;
  /** The latest 1099 already ordered for this contractor and year, if any. */
  filing: { orderId: number; federalStatus: string | null; copyStatus: string | null } | null;
}

export async function contractorsForYear(storeId: number, taxYear: number): Promise<ContractorYear[]> {
  const { rows } = await pool.query(
    `WITH paid AS (
       SELECT i.staff_id, SUM(COALESCE(i.commission_amount,0) + COALESCE(i.tips,0) + COALESCE(i.other_earnings,0)) AS amount
         FROM payroll_run_items i JOIN payroll_runs r ON r.id = i.payroll_run_id
        WHERE r.store_id = $1 AND r.status IN ('approved','finalized') AND i.status = 'paid'
          AND EXTRACT(YEAR FROM COALESCE(r.pay_date, r.period_end::date)) = $2
        GROUP BY i.staff_id)
     SELECT s.id, s.name, se.legal_name, se.worker_type, se.tax_id_enc IS NOT NULL AS has_tin,
            s.mailing_address1, s.mailing_city, s.mailing_state, s.mailing_zip, COALESCE(p.amount, 0) AS amount,
            (SELECT json_build_object('orderId', f.order_id, 'federalStatus', f.federal_status, 'copyStatus', f.copy_status)
               FROM tax_filing_forms f JOIN tax_filing_orders o ON o.id = f.order_id
              WHERE f.staff_id = s.id AND f.tax_year = $2 AND o.status IN ('paid','filing','filed')
              ORDER BY f.id DESC LIMIT 1) AS filing
       FROM staff s
       LEFT JOIN staff_employment se ON se.staff_id = s.id
       LEFT JOIN paid p ON p.staff_id = s.id
      WHERE s.store_id = $1 AND (p.amount > 0 OR se.worker_type = '1099')
      ORDER BY COALESCE(p.amount, 0) DESC, s.name`,
    [storeId, taxYear],
  );
  const threshold = necThreshold(taxYear);
  return rows.map((r: any) => {
    const missing: string[] = [];
    if (r.worker_type !== "1099") missing.push(r.worker_type === "w2" ? "Set as a W-2 employee (no 1099)" : "Worker type not set to 1099 contractor");
    if (!String(r.legal_name ?? "").trim()) missing.push("Legal name");
    if (!r.has_tin) missing.push("Tax ID (SSN or EIN)");
    if (!r.mailing_address1 || !r.mailing_city || !r.mailing_state || !r.mailing_zip) missing.push("Mailing address");
    const amount = Math.round(Number(r.amount) * 100) / 100;
    return {
      staffId: Number(r.id), name: r.name, legalName: r.legal_name ?? null, workerType: r.worker_type ?? null,
      amount, overThreshold: amount >= threshold, missing, ready: missing.length === 0 && amount > 0,
      filing: r.filing ?? null,
    };
  });
}

/** The salon as payer, with its EIN decrypted — for sending to TaxBandits only. Null when something is missing. */
export async function payerFor(storeId: number): Promise<Payer | null> {
  const { rows: [p] } = await pool.query(`SELECT * FROM salon_tax_payer WHERE store_id = $1`, [storeId]);
  if (!p?.legal_name || !p.ein_enc || !p.address1 || !p.city || !p.state || !p.zip || !p.email || !p.phone) return null;
  return {
    businessId: p.taxbandits_business_id ?? null,
    legalName: p.legal_name,
    ein: decryptTaxValue(p.ein_enc),
    address: { address1: p.address1, address2: p.address2, city: p.city, state: p.state, zip: p.zip },
    contact: { firstName: p.contact_first_name || "Owner", lastName: p.contact_last_name || p.legal_name, phone: p.phone, email: p.email },
  };
}

/** One contractor as a 1099 recipient, tax id decrypted — for sending to TaxBandits only. */
export async function recipientFor(staffId: number, amount: number, sequenceId: string): Promise<Recipient> {
  const { rows: [r] } = await pool.query(
    `SELECT s.email, s.mailing_address1, s.mailing_address2, s.mailing_city, s.mailing_state, s.mailing_zip,
            se.legal_name, se.tax_id_type, se.tax_id_enc, se.w9_business_name
       FROM staff s JOIN staff_employment se ON se.staff_id = s.id WHERE s.id = $1`, [staffId]);
  if (!r?.tax_id_enc) throw new Error("Tax ID missing");
  const tinType: "SSN" | "EIN" = r.tax_id_type === "ein" ? "EIN" : "SSN";
  const words = String(r.legal_name ?? "").trim().split(/\s+/);
  const lastName = words.length > 1 ? words[words.length - 1] : words[0];
  const firstName = words.length > 1 ? words.slice(0, -1).join(" ") : words[0];
  return {
    sequenceId, tinType, tin: decryptTaxValue(r.tax_id_enc),
    ...(tinType === "EIN" ? { businessName: String(r.w9_business_name || r.legal_name).trim() } : { firstName, lastName }),
    address: { address1: r.mailing_address1, address2: r.mailing_address2, city: r.mailing_city, state: r.mailing_state, zip: r.mailing_zip },
    email: r.email || null,
    amount,
  };
}

/**
 * File a paid order: create the returns at TaxBandits, then transmit them. Runs once per order (paid → filing is one
 * UPDATE), so a webhook and the return page arriving together never file twice.
 */
export async function fileOrder(orderId: number): Promise<void> {
  const claimed = await pool.query(`UPDATE tax_filing_orders SET status = 'filing', last_error = NULL WHERE id = $1 AND status = 'paid' RETURNING *`, [orderId]);
  const order = claimed.rows[0];
  if (!order) return;
  try {
    const payer = await payerFor(order.store_id);
    if (!payer) throw new Error("The salon's legal name, EIN, address or contact details are missing.");
    const { rows: forms } = await pool.query(`SELECT id, staff_id, amount FROM tax_filing_forms WHERE order_id = $1 ORDER BY id`, [orderId]);
    const recipients = await Promise.all(forms.map((f: any) => recipientFor(f.staff_id, Number(f.amount), `f${f.id}`)));
    const delivery: CopyDelivery = order.mail_copies ? "POSTAL_AND_ONLINE" : "ONLINE_ACCESS";
    const created = await createNec(order.tax_year, payer, recipients, delivery);
    if (!created.submissionId) throw new Error("TaxBandits did not create the returns.");
    if (created.businessId && created.businessId !== payer.businessId) {
      await pool.query(`UPDATE salon_tax_payer SET taxbandits_business_id = $2 WHERE store_id = $1`, [order.store_id, created.businessId]);
    }
    for (const rec of created.records) {
      await pool.query(
        `UPDATE tax_filing_forms SET record_id = $2, federal_status = $3, copy_status = $4, errors = $5, submission_id = $6, recipient_id = $7, updated_at = NOW() WHERE id = $1`,
        [Number(rec.sequenceId.slice(1)), rec.recordId, rec.federalStatus, rec.copyStatus, rec.errors ? JSON.stringify(rec.errors) : null, created.submissionId, rec.recipientId],
      );
    }
    await pool.query(`UPDATE tax_filing_orders SET submission_id = $2 WHERE id = $1`, [orderId, created.submissionId]);
    const good = created.records.filter((r) => r.recordId && r.federalStatus !== "ERROR").map((r) => r.recordId!) ;
    if (good.length) {
      const sent = await transmitNec(created.submissionId, good);
      for (const s of sent) {
        await pool.query(`UPDATE tax_filing_forms SET federal_status = $2, copy_status = COALESCE($3, copy_status), updated_at = NOW() WHERE order_id = $1 AND record_id = $4`,
          [orderId, s.federalStatus, s.copyStatus, s.recordId]);
      }
    }
    const failed = created.records.length - good.length;
    await pool.query(`UPDATE tax_filing_orders SET status = $2, filed_at = NOW(), last_error = $3 WHERE id = $1`,
      [orderId, good.length ? "filed" : "failed", failed ? `${failed} form(s) had errors and were not filed` : null]);
  } catch (err: any) {
    console.error(`[tax1099] order ${orderId} filing failed:`, err?.message);
    await pool.query(`UPDATE tax_filing_orders SET status = 'failed', last_error = $2 WHERE id = $1`, [orderId, String(err?.message ?? "Filing failed").slice(0, 300)]);
  }
}

/** Save what TaxBandits says about the returns in one of its submissions. */
async function saveSubmissionStatus(submissionId: string): Promise<void> {
  for (const st of await necStatus(submissionId)) {
    await pool.query(
      `UPDATE tax_filing_forms SET federal_status = COALESCE($3, federal_status), state_status = $4, copy_status = COALESCE($5, copy_status),
              errors = CASE WHEN $3 = 'REJECTED' THEN COALESCE($6, errors) WHEN $3 = 'ACCEPTED' THEN NULL ELSE errors END,
              status_checked_at = NOW(), updated_at = NOW()
        WHERE submission_id = $1 AND record_id = $2`,
      [submissionId, st.recordId, st.federalStatus, st.stateStatus, st.copyStatus, st.federalErrors ? JSON.stringify(st.federalErrors) : null],
    );
  }
}

/** Ask TaxBandits where an order's returns are now, and save it. */
export async function refreshOrderStatus(orderId: number): Promise<void> {
  const { rows } = await pool.query(`SELECT DISTINCT submission_id FROM tax_filing_forms WHERE order_id = $1 AND submission_id IS NOT NULL`, [orderId]);
  for (const r of rows) await saveSubmissionStatus(r.submission_id);
}

/** A form that can be sent again: rejected by the IRS, or never created because of an error. */
export const canRefile = (federalStatus: string | null) => federalStatus === "REJECTED" || federalStatus === "ERROR" || federalStatus == null;

/**
 * Send a rejected (or never-created) 1099 again with the details as they are now — after the owner fixed the
 * contractor's tax id, name or address on Payroll & Tax, or the salon's details. Same amount; no new charge.
 * Updates the return in place when TaxBandits allows it, otherwise files it as a new return. Returns the new status.
 */
export async function refileForm(formId: number, storeId: number): Promise<{ federalStatus: string | null; errors: unknown }> {
  const { rows: [f] } = await pool.query(
    `SELECT f.*, o.tax_year, o.mail_copies, o.status AS order_status FROM tax_filing_forms f JOIN tax_filing_orders o ON o.id = f.order_id
      WHERE f.id = $1 AND f.store_id = $2`, [formId, storeId]);
  if (!f) throw new Error("Form not found");
  if (!["filed", "failed"].includes(f.order_status)) throw new Error("This order hasn't been paid and filed yet.");
  if (!canRefile(f.federal_status)) throw new Error("Only a rejected form can be sent again.");
  const payer = await payerFor(storeId);
  if (!payer) throw new Error("The salon's legal name, EIN, address or contact details are missing.");
  const recipient = await recipientFor(f.staff_id, Number(f.amount), `f${f.id}`);
  const delivery: CopyDelivery = f.mail_copies ? "POSTAL_AND_ONLINE" : "ONLINE_ACCESS";

  let submissionId: string | null = f.submission_id;
  let rec = f.record_id && f.submission_id
    ? await updateNec(f.tax_year, payer, recipient, delivery, { submissionId: f.submission_id, recordId: f.record_id, recipientId: f.recipient_id })
    : null;
  if (!rec) {
    // TaxBandits would not change it (or it was never created): file it as a new return.
    const created = await createNec(f.tax_year, payer, [recipient], delivery);
    rec = created.records[0] ?? null;
    submissionId = created.submissionId;
  }
  if (!rec || !submissionId || !rec.recordId || rec.federalStatus === "ERROR") {
    const errors = rec?.errors ?? [{ Message: "TaxBandits did not accept the corrected form." }];
    await pool.query(`UPDATE tax_filing_forms SET federal_status = 'ERROR', errors = $2, updated_at = NOW() WHERE id = $1`, [formId, JSON.stringify(errors)]);
    return { federalStatus: "ERROR", errors };
  }
  const [sent] = await transmitNec(submissionId, [rec.recordId]);
  const status = sent?.federalStatus ?? rec.federalStatus;
  await pool.query(
    `UPDATE tax_filing_forms SET submission_id = $2, record_id = $3, recipient_id = COALESCE($4, recipient_id), federal_status = $5,
            copy_status = COALESCE($6, copy_status), errors = NULL, recipient_name = $7, refile_count = refile_count + 1, last_refiled_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [formId, submissionId, rec.recordId, rec.recipientId, status, sent?.copyStatus ?? rec.copyStatus,
     recipient.businessName ?? `${recipient.firstName ?? ""} ${recipient.lastName ?? ""}`.trim()],
  );
  await pool.query(`UPDATE tax_filing_orders SET status = 'filed', last_error = NULL WHERE id = $1 AND status = 'failed'`, [f.order_id]);
  return { federalStatus: status, errors: null };
}

/**
 * Automatic status updates: every form sent to the IRS and not yet accepted or rejected is checked again, at most once
 * an hour per form, for up to 120 days. Run by the scheduler (startTaxFilingStatusSync).
 */
export async function syncFilingStatuses(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT DISTINCT submission_id FROM tax_filing_forms
      WHERE submission_id IS NOT NULL AND COALESCE(federal_status, '') NOT IN ('ACCEPTED', 'REJECTED', 'ERROR')
        AND (status_checked_at IS NULL OR status_checked_at < NOW() - INTERVAL '1 hour')
        AND updated_at > NOW() - INTERVAL '120 days'
      LIMIT 200`);
  for (const r of rows) {
    try { await saveSubmissionStatus(r.submission_id); }
    catch (err: any) { console.error("[tax1099] status check failed:", err?.message); }
  }
}

let statusTimer: NodeJS.Timeout | null = null;
export function startTaxFilingStatusSync(): void {
  if (statusTimer) return;
  setTimeout(() => void syncFilingStatuses(), 2 * 60 * 1000);
  statusTimer = setInterval(() => void syncFilingStatuses(), 60 * 60 * 1000);
  console.log("[tax1099] Status sync started (hourly)");
}
