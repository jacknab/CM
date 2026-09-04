/**
 * stripeContractorAccounts.ts — the ONLY place that creates / attaches banks to /
 * syncs status for a contractor's Stripe connected account.
 *
 * Model: recipient-configured **Custom** accounts. Certxa creates a
 * transfers-only account (`controller.requirement_collection: "application"`,
 * `tos_acceptance.service_agreement: "recipient"`) and collects just the legal
 * name + US bank routing/account number — no Stripe-hosted onboarding.
 *
 * See .claude/skills/stripe-connect-payouts/SKILL.md.
 */
import { db } from "../db";
import { contractors, contractorBankAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getStripe } from "./stripe";

type ContractorRow = typeof contractors.$inferSelect;

export interface ContractorAccountStatus {
  stripeAccountId: string;
  accountType: string;
  bankVerified: boolean;
  onboardingStatus: "pending" | "in_progress" | "complete" | "restricted";
  requirementsDue: string[];
  transfersCapability: string | null;
  payoutsEnabled: boolean;
}

/** Create a fresh recipient-configured Custom account and persist it on the row. */
export async function createCustomContractorAccount(
  c: ContractorRow,
  ip?: string | null,
): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "custom",
    country: (c.country || "US").toUpperCase(),
    capabilities: { transfers: { requested: true } },
    business_type: "individual",
    controller: { requirement_collection: "application" },
    individual: {
      first_name: c.firstName || undefined,
      last_name: c.lastName || undefined,
      email: c.email || undefined,
    },
    // Recipient service agreement: transfers-only, minimal KYC, no dashboard.
    // The platform accepts it on the account's behalf.
    tos_acceptance: {
      service_agreement: "recipient",
      date: Math.floor(Date.now() / 1000),
      ip: ip || "0.0.0.0",
    },
    metadata: { contractorId: String(c.id), storeId: String(c.storeId) },
  } as any);

  await db.update(contractors).set({
    stripeAccountId: account.id,
    accountType: "custom",
    stripeTosAcceptedAt: new Date(),
    bankVerified: false,
    onboardingStatus: "in_progress",
    updatedAt: new Date(),
  }).where(eq(contractors.id, c.id));

  return account.id;
}

/** Return a usable Custom account id, (re)creating it if missing / still Express. */
export async function ensureContractorAccount(
  c: ContractorRow,
  ip?: string | null,
): Promise<string> {
  if (c.stripeAccountId && c.accountType === "custom") {
    try {
      await getStripe().accounts.retrieve(c.stripeAccountId);
      return c.stripeAccountId;
    } catch {
      // account gone / keys rotated — fall through and recreate
    }
  }
  return createCustomContractorAccount(c, ip);
}

/** Attach a client-tokenized bank account (btok_…) as an external account. */
export async function attachExternalBankAccount(
  accountId: string,
  bankToken: string,
): Promise<string> {
  const ext = await getStripe().accounts.createExternalAccount(accountId, {
    external_account: bankToken,
    default_for_currency: true,
  } as any);
  return ext.id;
}

/**
 * Pull the live account, derive bankVerified / onboardingStatus /
 * requirementsDue, and persist onto the contractor + its default bank row.
 */
export async function syncContractorAccountStatus(
  contractorId: number,
): Promise<ContractorAccountStatus | null> {
  const [c] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
  if (!c || !c.stripeAccountId) return null;

  const acct = await getStripe().accounts.retrieve(c.stripeAccountId);

  const transfersCap = ((acct.capabilities as any)?.transfers ?? null) as string | null;
  const due     = (acct.requirements?.currently_due ?? []) as string[];
  const pastDue = (acct.requirements?.past_due ?? []) as string[];
  const disabledReason = acct.requirements?.disabled_reason ?? null;
  const payoutsEnabled = !!acct.payouts_enabled;
  const hasExternal = ((acct as any).external_accounts?.data?.length ?? 0) > 0;

  const bankVerified = transfersCap === "active" && due.length === 0 && payoutsEnabled;

  let onboardingStatus: ContractorAccountStatus["onboardingStatus"];
  if (bankVerified) onboardingStatus = "complete";
  else if (disabledReason || pastDue.length > 0) onboardingStatus = "restricted";
  else if (hasExternal || transfersCap === "pending") onboardingStatus = "in_progress";
  else onboardingStatus = "pending";

  await db.update(contractors).set({
    bankVerified,
    onboardingStatus,
    requirementsDue: due.length ? due : null,
    updatedAt: new Date(),
  }).where(eq(contractors.id, contractorId));

  await db.update(contractorBankAccounts).set({
    verificationStatus: bankVerified
      ? "verified"
      : onboardingStatus === "restricted" ? "failed" : "pending",
  }).where(eq(contractorBankAccounts.contractorId, contractorId));

  return {
    stripeAccountId: c.stripeAccountId,
    accountType: c.accountType ?? "custom",
    bankVerified,
    onboardingStatus,
    requirementsDue: due,
    transfersCapability: transfersCap,
    payoutsEnabled,
  };
}

/** Reverse lookup for webhooks: which contractor owns this connected account? */
export async function findContractorByStripeAccount(accountId: string) {
  const [c] = await db.select().from(contractors).where(eq(contractors.stripeAccountId, accountId));
  return c ?? null;
}
