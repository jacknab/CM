/**
 * TaxBandits client — 1099-NEC filing for salons' contractors (plans/1099-filing-taxbandits.md, 2026-10-24).
 *
 * Credentials live in /etc/certxa-taxbandits.env (root-only), loaded here on first use. TAXBANDITS_ENV=sandbox uses the
 * test hosts; anything else the live ones. Every call below was checked against the sandbox on 2026-10-24:
 *   auth      GET  {oauth}/v2/tbsauth             header `Authentication: <HS256 JWS>` → AccessToken (1 h)
 *   create    POST {api}/v2.0.0/Form1099NEC/Create → SubmissionId, BusinessId, Form1099Records.SuccessRecords[].RecordId
 *   transmit  POST {api}/v2.0.0/Form1099/Transmit  { SubmissionId, RecordIds, FormType: "NEC" }
 *   status    GET  {api}/v2.0.0/Form1099/Status?SubmissionId=…&FormType=NEC
 *   update    PUT  {api}/v2.0.0/form1099nec/update   (POST is 404) — same body + SubmissionId, RecordId, RecipientId
 * Tax ids are sent as plain text only inside these HTTPS requests; nothing here logs a request body.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import dotenv from "dotenv";

let envLoaded = false;
function env() {
  if (!envLoaded) {
    envLoaded = true;
    if (fs.existsSync("/etc/certxa-taxbandits.env")) dotenv.config({ path: "/etc/certxa-taxbandits.env", override: false });
  }
  const sandbox = (process.env.TAXBANDITS_ENV ?? "sandbox") === "sandbox";
  return {
    sandbox,
    clientId: process.env.TAXBANDITS_CLIENT_ID ?? "",
    clientSecret: process.env.TAXBANDITS_CLIENT_SECRET ?? "",
    userToken: process.env.TAXBANDITS_USER_TOKEN ?? "",
    oauth: sandbox ? "https://testoauth.expressauth.net" : "https://oauth.expressauth.net",
    api: sandbox ? "https://testapi.taxbandits.com/v2.0.0" : "https://api.taxbandits.com/v2.0.0",
  };
}

export const taxBanditsConfigured = () => { const e = env(); return !!(e.clientId && e.clientSecret && e.userToken); };
export const taxBanditsSandbox = () => env().sandbox;

export class TaxBanditsError extends Error {
  constructor(message: string, public details?: unknown) { super(message); }
}

let token: { value: string; expires: number } | null = null;
async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const e = env();
  if (!taxBanditsConfigured()) throw new TaxBanditsError("1099 filing is not set up on this server (TaxBandits credentials).");
  const b64 = (o: unknown) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: e.clientId, sub: e.clientId, aud: e.userToken, iat: Math.floor(Date.now() / 1000) });
  const jws = `${head}.${body}.${crypto.createHmac("sha256", e.clientSecret).update(`${head}.${body}`).digest("base64url")}`;
  const r = await fetch(`${e.oauth}/v2/tbsauth`, { headers: { Authentication: jws } });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.AccessToken) throw new TaxBanditsError("Could not sign in to TaxBandits.", d?.Errors);
  token = { value: String(d.AccessToken), expires: Date.now() + (Number(d.ExpiresIn) || 3600) * 1000 };
  return token.value;
}

async function call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<any> {
  const r = await fetch(env().api + path, {
    method,
    headers: { Authorization: await accessToken(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d: any = await r.json().catch(() => ({}));
  if (r.status === 401) token = null;
  if (!r.ok && r.status !== 207) throw new TaxBanditsError(`TaxBandits answered ${r.status}`, d?.Errors ?? d);
  return d;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface Address { address1: string; address2?: string | null; city: string; state: string; zip: string }
export interface Payer {
  businessId?: string | null;
  legalName: string;
  ein: string; // 9 digits
  address: Address;
  contact: { firstName: string; lastName: string; phone: string; email: string };
}
export interface Recipient {
  sequenceId: string;
  tinType: "SSN" | "EIN";
  tin: string; // 9 digits
  /** An individual: first + last name. A business (EIN): its name. */
  firstName?: string; lastName?: string; businessName?: string;
  address: Address;
  email?: string | null;
  amount: number; // nonemployee compensation, box 1
}
export type CopyDelivery = "ONLINE_ACCESS" | "POSTAL_AND_ONLINE";

const fmtTin = (tin: string, type: "SSN" | "EIN") => (type === "EIN" ? `${tin.slice(0, 2)}-${tin.slice(2)}` : `${tin.slice(0, 3)}-${tin.slice(3, 5)}-${tin.slice(5)}`);
const addr = (a: Address) => ({ Address1: a.address1, Address2: a.address2 || null, City: a.city, ProvinceOrState: a.state, ZipCd: a.zip, Country: "US" });

function necBody(taxYear: number, payer: Payer, recipients: Recipient[], delivery: CopyDelivery) {
  const dist = delivery === "POSTAL_AND_ONLINE" ? { DistributionType: "POSTAL_AND_ONLINE", PostalType: "USPS_FIRST_CLASS" } : { DistributionType: "ONLINE_ACCESS" };
  return {
    SubmissionManifest: { TaxYear: String(taxYear), IsFederal: true, IsState: false, IsDistribution: true, DistributionDetails: dist, IsScheduleFiling: false, ScheduleFiling: null },
    ReturnHeader: {
      Business: {
        BusinessId: payer.businessId || null,
        TINDetails: { Format: "PLAIN_TIN", TINType: "EIN", TIN: fmtTin(payer.ein, "EIN") },
        BusinessNm: payer.legalName,
        Address: addr(payer.address),
        ContactDetails: { FirstNm: payer.contact.firstName, LastNm: payer.contact.lastName, Phone: payer.contact.phone.replace(/\D/g, ""), Email: payer.contact.email },
      },
    },
    ReturnData: recipients.map((r) => ({
      SequenceId: r.sequenceId,
      ReturnManifest: { IsFederal: true, IsState: false, IsDistribution: true, DistributionDetails: dist, IsForced: false },
      Recipient: {
        TINDetails: { Format: "PLAIN_TIN", TINType: r.tinType, TIN: fmtTin(r.tin, r.tinType) },
        ...(r.businessName ? { BusinessNm: r.businessName } : { IndividualNm: { FirstNm: r.firstName ?? "", LastNm: r.lastName ?? "" } }),
        Address: addr(r.address),
        Email: r.email || null,
      },
      NECFormData: { NEC: Math.round(r.amount * 100) / 100, FedTaxWH: 0, IsDirectSales: false, Is2ndTINnot: false, States: null },
    })),
  };
}

export interface RecordResult { sequenceId: string; recordId: string | null; recipientId: string | null; federalStatus: string | null; copyStatus: string | null; errors: unknown }

/** Problems TaxBandits finds before anything is created: sequence id → messages. Empty when it is all good. */
export async function validateNec(taxYear: number, payer: Payer, recipients: Recipient[], delivery: CopyDelivery): Promise<Record<string, string[]>> {
  const d = await call("POST", "/form1099nec/validateform", necBody(taxYear, payer, recipients, delivery));
  const out: Record<string, string[]> = {};
  for (const rec of d?.ErrorRecords ?? []) out[String(rec.SequenceId)] = (rec.Errors ?? []).map((e: any) => String(e.Message ?? e.Name ?? "Invalid"));
  if (d?.Errors?.length) out["_"] = d.Errors.map((e: any) => String(e.Message ?? e.Name ?? "Invalid"));
  return out;
}

/** Create the returns (not filed yet). */
export async function createNec(taxYear: number, payer: Payer, recipients: Recipient[], delivery: CopyDelivery) {
  const d = await call("POST", "/Form1099NEC/Create", necBody(taxYear, payer, recipients, delivery));
  const ok: RecordResult[] = (d?.Form1099Records?.SuccessRecords ?? []).map((r: any) => ({
    sequenceId: String(r.SequenceId), recordId: r.RecordId ?? null, recipientId: r.RecipientId ?? null, federalStatus: r.Federal?.Status ?? null,
    copyStatus: r.Distribution?.OnlineAccess?.Status ?? r.Distribution?.Postal?.Status ?? null, errors: null,
  }));
  const bad: RecordResult[] = (d?.Form1099Records?.ErrorRecords ?? []).map((r: any) => ({
    sequenceId: String(r.SequenceId), recordId: r.RecordId ?? null, recipientId: null, federalStatus: "ERROR", copyStatus: null, errors: r.Errors ?? null,
  }));
  return { submissionId: d?.SubmissionId ? String(d.SubmissionId) : null, businessId: d?.BusinessId ? String(d.BusinessId) : null, records: [...ok, ...bad], errors: d?.Errors ?? null };
}

/** Change a return that has not been accepted (a rejected one, or one not sent yet) with the corrected details.
 *  Returns null when TaxBandits will not change it — the caller then files it as a new return. */
export async function updateNec(taxYear: number, payer: Payer, recipient: Recipient, delivery: CopyDelivery,
  ids: { submissionId: string; recordId: string; recipientId?: string | null }): Promise<RecordResult | null> {
  const body: any = necBody(taxYear, payer, [recipient], delivery);
  body.SubmissionManifest.SubmissionId = ids.submissionId;
  body.ReturnData[0].RecordId = ids.recordId;
  if (ids.recipientId) body.ReturnData[0].Recipient.RecipientId = ids.recipientId;
  try {
    const d = await call("PUT", "/form1099nec/update", body);
    const ok = d?.Form1099Records?.SuccessRecords?.[0];
    if (!ok) return null;
    return { sequenceId: recipient.sequenceId, recordId: ok.RecordId ?? ids.recordId, recipientId: ok.RecipientId ?? ids.recipientId ?? null,
      federalStatus: ok.Federal?.Status ?? null, copyStatus: ok.Distribution?.OnlineAccess?.Status ?? ok.Distribution?.Postal?.Status ?? null, errors: null };
  } catch {
    return null;
  }
}

/** File the created returns with the IRS. */
export async function transmitNec(submissionId: string, recordIds: string[]) {
  const d = await call("POST", "/Form1099/Transmit", { SubmissionId: submissionId, RecordIds: recordIds, FormType: "NEC" });
  return (d?.Form1099Records ?? []).map((r: any) => ({
    recordId: String(r.RecordId), federalStatus: r.FederalStatus?.Status ?? null,
    copyStatus: r.Distribution?.OnlineAccessStatus?.Status ?? r.Distribution?.PostalStatus?.Status ?? null,
  }));
}

/** Where each return is now (federal, state, contractor copy). */
export async function necStatus(submissionId: string) {
  const d = await call("GET", `/Form1099/Status?SubmissionId=${encodeURIComponent(submissionId)}&FormType=NEC`);
  return (d?.Form1099Records ?? []).map((r: any) => ({
    recordId: String(r.RecordId),
    federalStatus: r.FederalStatus?.Status ?? null,
    federalErrors: r.FederalStatus?.Errors ?? null,
    stateStatus: Array.isArray(r.StatesStatus) && r.StatesStatus.length ? r.StatesStatus.map((s: any) => `${s.StateCd ?? ""} ${s.Status ?? ""}`.trim()).join(", ") : null,
    copyStatus: r.Distribution?.OnlineAccessStatus?.Status ?? r.Distribution?.PostalStatus?.Status ?? null,
  }));
}
