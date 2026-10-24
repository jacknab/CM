/**
 * 1099-NEC for salons' contractors (plans/1099-filing-taxbandits.md, 2026-10-24): what each contractor was paid in a tax
 * year, whether their 1099 can be filed (and what is missing), and filing a paid order through TaxBandits.
 *
 * "Paid" in a year = commission + tips + other earnings on approved payroll runs whose pay date falls in that year
 * (checks and the cash part alike), before booth rent and other deductions — box 1 of the 1099-NEC.
 */
import { pool } from "../db";
import { decryptTaxValue } from "./staffTaxCrypto";
import { createNec, transmitNec, necStatus, type CopyDelivery, type Payer, type Recipient } from "./taxbandits";

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
        `UPDATE tax_filing_forms SET record_id = $2, federal_status = $3, copy_status = $4, errors = $5, updated_at = NOW() WHERE id = $1`,
        [Number(rec.sequenceId.slice(1)), rec.recordId, rec.federalStatus, rec.copyStatus, rec.errors ? JSON.stringify(rec.errors) : null],
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

/** Ask TaxBandits where an order's returns are now, and save it. */
export async function refreshOrderStatus(orderId: number): Promise<void> {
  const { rows: [order] } = await pool.query(`SELECT submission_id FROM tax_filing_orders WHERE id = $1`, [orderId]);
  if (!order?.submission_id) return;
  for (const s of await necStatus(order.submission_id)) {
    await pool.query(
      `UPDATE tax_filing_forms SET federal_status = COALESCE($3, federal_status), state_status = $4, copy_status = COALESCE($5, copy_status),
              errors = COALESCE($6, errors), updated_at = NOW() WHERE order_id = $1 AND record_id = $2`,
      [orderId, s.recordId, s.federalStatus, s.stateStatus, s.copyStatus, s.federalErrors ? JSON.stringify(s.federalErrors) : null],
    );
  }
}
