/**
 * What Stripe needs to set up card payments, asked once at Certxa sign-up (owner, 2026-11-10) and handed to Stripe,
 * so the owner never types it twice. Stripe's setup form (embedded on certxa.com) leaves out every field that is
 * already filled in.
 *
 *   Date of birth                → owner_payment_details.date_of_birth, encrypted (lib/staffTaxCrypto.ts)
 *   Home address                 → owner_payment_details (or "same as the business address": a home studio)
 *   Business structure, EIN      → locations.legal_entity_type / ein, the same fields as Business Settings
 *   Legal business name          → owner_payment_details.legal_name (LLCs and corporations)
 *   Last 4 of the SSN            → never stored: sent straight to Stripe (POST /api/payments/stripe/identity)
 *
 * prefillStripeAccount() writes all of it to the business's Stripe account. Stripe accepts changes from Certxa only
 * until the owner has submitted the setup form; after that it is Stripe's form that keeps the details, so it skips.
 */
import type Stripe from "stripe";
import { pool } from "../db";
import { getStripe as getPlatformStripe } from "./stripe";
import { decryptTaxValue, encryptTaxValue } from "./staffTaxCrypto";

/** Business Settings' structures (pages/BusinessSettings.tsx) → how Stripe files them. */
const STRUCTURES: Record<string, { businessType: "individual" | "company" | "non_profit"; structure?: string }> = {
  "Sole proprietorship": { businessType: "individual" },
  "Single-member LLC":   { businessType: "company", structure: "single_member_llc" },
  "Multi-member LLC":    { businessType: "company", structure: "multi_member_llc" },
  "Partnership":         { businessType: "company", structure: "private_partnership" },
  "S corporation":       { businessType: "company", structure: "private_corporation" },
  "C corporation":       { businessType: "company", structure: "private_corporation" },
  "Nonprofit":           { businessType: "non_profit" },
};
export const LEGAL_ENTITY_TYPES = Object.keys(STRUCTURES);
export const isCompanyStructure = (value: string | null | undefined) => STRUCTURES[value ?? ""]?.businessType !== undefined && STRUCTURES[value ?? ""].businessType !== "individual";

export type OwnerPaymentDetailsInput = {
  dateOfBirth?: string | null;           // YYYY-MM-DD
  homeSameAsBusiness?: boolean;
  homeAddress?: string | null; homeCity?: string | null; homeState?: string | null; homePostcode?: string | null;
  legalEntityType?: string | null;       // one of LEGAL_ENTITY_TYPES
  legalName?: string | null;
  ein?: string | null;                   // 9 digits, any punctuation
};

export class DetailsError extends Error {}

/** A real calendar date, 13 to 120 years ago (Stripe's own range for an account holder). */
export function validDateOfBirth(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  const age = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  return age >= 13 && age <= 120;
}

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Saves what was given; a field left out keeps what is there. Throws DetailsError with a message for the owner. */
export async function saveOwnerPaymentDetails(storeId: number, input: OwnerPaymentDetailsInput): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [storeId];
  const set = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };

  if (input.dateOfBirth !== undefined) {
    const dob = clean(input.dateOfBirth, 10);
    if (dob && !validDateOfBirth(dob)) throw new DetailsError("Enter your date of birth as month, day and year.");
    set("date_of_birth", dob ? encryptTaxValue(dob) : null);
  }
  if (input.homeSameAsBusiness !== undefined) set("home_same_as_business", Boolean(input.homeSameAsBusiness));
  if (input.homeAddress !== undefined || input.homeCity !== undefined || input.homeState !== undefined || input.homePostcode !== undefined) {
    const address = { line1: clean(input.homeAddress), city: clean(input.homeCity, 100), state: clean(input.homeState, 2).toUpperCase(), postcode: clean(input.homePostcode, 5) };
    const any = address.line1 || address.city || address.state || address.postcode;
    if (any && !(address.line1 && address.city && /^[A-Z]{2}$/.test(address.state) && /^\d{5}$/.test(address.postcode))) {
      throw new DetailsError("Enter your home street address, city, 2-letter state and 5-digit ZIP code.");
    }
    set("home_address", address.line1 || null); set("home_city", address.city || null);
    set("home_state", address.state || null); set("home_postcode", address.postcode || null);
  }
  if (input.legalName !== undefined) set("legal_name", clean(input.legalName) || null);
  if (sets.length) {
    await pool.query(
      `INSERT INTO owner_payment_details (store_id) VALUES ($1) ON CONFLICT (store_id) DO NOTHING`, [storeId]);
    await pool.query(`UPDATE owner_payment_details SET ${sets.join(", ")}, updated_at = now() WHERE store_id = $1`, values);
  }

  // The business structure and EIN are the Business Settings fields.
  const storeSets: string[] = [];
  const storeValues: unknown[] = [storeId];
  if (input.legalEntityType !== undefined) {
    const type = clean(input.legalEntityType, 40);
    if (type && !STRUCTURES[type]) throw new DetailsError("Choose how your business is set up.");
    storeValues.push(type || null); storeSets.push(`legal_entity_type = $${storeValues.length}`);
  }
  if (input.ein !== undefined) {
    const digits = clean(input.ein, 20).replace(/\D/g, "");
    if (digits && digits.length !== 9) throw new DetailsError("An EIN is 9 digits, like 12-3456789.");
    storeValues.push(digits ? `${digits.slice(0, 2)}-${digits.slice(2)}` : null); storeSets.push(`ein = $${storeValues.length}`);
  }
  if (storeSets.length) await pool.query(`UPDATE locations SET ${storeSets.join(", ")} WHERE id = $1`, storeValues);
}

type Loaded = {
  dateOfBirth: string | null;
  home: { line1: string; city: string; state: string; postcode: string } | null;
  homeSameAsBusiness: boolean;
  legalName: string | null;
  ssnSent: boolean;
  legalEntityType: string | null;
  ein: string | null;
};

export async function loadOwnerPaymentDetails(storeId: number): Promise<Loaded> {
  const [{ rows: d }, { rows: s }] = await Promise.all([
    pool.query(`SELECT date_of_birth, home_same_as_business, home_address, home_city, home_state, home_postcode, legal_name, ssn_sent_at
                  FROM owner_payment_details WHERE store_id = $1`, [storeId]),
    pool.query(`SELECT legal_entity_type, ein FROM locations WHERE id = $1`, [storeId]),
  ]);
  const row = d[0];
  let dateOfBirth: string | null = null;
  if (row?.date_of_birth) {
    try { dateOfBirth = decryptTaxValue(row.date_of_birth); } catch (err: any) { console.warn(`[owner-payment-details] store=${storeId} date of birth unreadable: ${err?.message}`); }
  }
  return {
    dateOfBirth,
    home: row?.home_address ? { line1: row.home_address, city: row.home_city, state: row.home_state, postcode: row.home_postcode } : null,
    homeSameAsBusiness: Boolean(row?.home_same_as_business),
    legalName: row?.legal_name ?? null,
    ssnSent: Boolean(row?.ssn_sent_at),
    legalEntityType: s[0]?.legal_entity_type ?? null,
    ein: s[0]?.ein ?? null,
  };
}

/** For the app: what is already on file (never the values themselves). */
export async function ownerPaymentDetailsSummary(storeId: number) {
  const d = await loadOwnerPaymentDetails(storeId);
  return {
    hasDateOfBirth: Boolean(d.dateOfBirth),
    hasHomeAddress: Boolean(d.home) || d.homeSameAsBusiness,
    legalEntityType: d.legalEntityType,
    isCompany: isCompanyStructure(d.legalEntityType),
    hasEin: Boolean(d.ein),
    ssnSent: d.ssnSent,
  };
}

const e164 = (phone: string | null | undefined) => {
  const digits = String(phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `+1${digits}` : undefined;
};
const stripeDob = (iso: string | null) => {
  if (!iso) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  return { day, month, year };
};

/**
 * Writes what Certxa knows to the business's Stripe account, so Stripe's form doesn't ask for it. Never throws:
 * a refusal from Stripe just means its form asks for that field instead.
 */
export async function prefillStripeAccount(storeId: number, accountId: string, extra: { ssnLast4?: string } = {}): Promise<void> {
  const stripe = getPlatformStripe();
  try {
    const account = await stripe.accounts.retrieve(accountId);
    if (account.details_submitted && !extra.ssnLast4) return;
    const details = await loadOwnerPaymentDetails(storeId);
    const { rows: [store] } = await pool.query(
      `SELECT l.name, l.address, l.city, l.state, l.postcode, l.phone, l.email, u.first_name, u.last_name, u.email AS owner_email, u.phone AS owner_phone
         FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [storeId]);
    if (!store) return;
    const businessAddress = store.address && store.city && store.state && store.postcode
      ? { line1: store.address, city: store.city, state: store.state, postal_code: store.postcode, country: "US" } : undefined;
    const homeAddress = details.home
      ? { line1: details.home.line1, city: details.home.city, state: details.home.state, postal_code: details.home.postcode, country: "US" }
      : details.homeSameAsBusiness ? businessAddress : undefined;
    const person = {
      first_name: store.first_name ?? undefined,
      last_name: store.last_name ?? undefined,
      email: store.owner_email ?? store.email ?? undefined,
      phone: e164(store.owner_phone),
      dob: stripeDob(details.dateOfBirth),
      address: homeAddress,
      ...(extra.ssnLast4 ? { ssn_last_4: extra.ssnLast4 } : {}),
    };
    const kind = STRUCTURES[details.legalEntityType ?? ""] ?? { businessType: "individual" as const };

    if (kind.businessType === "individual") {
      await stripe.accounts.update(accountId, { business_type: "individual", individual: person } as Stripe.AccountUpdateParams);
    } else {
      const ein = details.ein?.replace(/\D/g, "");
      await stripe.accounts.update(accountId, {
        business_type: kind.businessType,
        company: {
          name: details.legalName || store.name || undefined,
          ...(ein?.length === 9 ? { tax_id: ein } : {}),
          ...(kind.structure ? { structure: kind.structure } : {}),
          address: businessAddress ?? homeAddress,
          phone: e164(store.phone) ?? e164(store.owner_phone),
        },
      } as Stripe.AccountUpdateParams);
      // The owner, as the person who runs the business (Stripe's "representative").
      const existing = await stripe.accounts.listPersons(accountId, { relationship: { representative: true }, limit: 1 });
      const relationship = { representative: true, owner: true, executive: true, title: "Owner" };
      if (existing.data[0]) await stripe.accounts.updatePerson(accountId, existing.data[0].id, { ...person, relationship } as Stripe.AccountUpdatePersonParams);
      else await stripe.accounts.createPerson(accountId, { ...person, relationship } as Stripe.AccountCreatePersonParams);
    }
    if (extra.ssnLast4) {
      await pool.query(`INSERT INTO owner_payment_details (store_id, ssn_sent_at) VALUES ($1, now())
                        ON CONFLICT (store_id) DO UPDATE SET ssn_sent_at = now(), updated_at = now()`, [storeId]);
    }
    console.log(`[owner-payment-details] store=${storeId} prefilled ${accountId} (${kind.businessType}${extra.ssnLast4 ? ", ssn last 4" : ""})`);
  } catch (err: any) {
    // Stripe's message names the field, never the value.
    console.warn(`[owner-payment-details] store=${storeId} prefill of ${accountId} not accepted: ${err?.message ?? err}`);
    if (extra.ssnLast4) throw new DetailsError("Stripe couldn't take those 4 digits right now. You can enter them in the setup form instead.");
  }
}
