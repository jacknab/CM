import { db } from "../db";
import { platformCreditTransactions } from "@shared/schema";

export type CreditTransactionType =
  | "topup"        // funds added via Stripe checkout
  | "ai_provision" // AI receptionist Twilio number provisioning
  | "ai_call"      // per-call AI receptionist charge
  | "sms"          // SMS message charge
  | "adjustment";  // manual admin credit adjustment

export async function logCreditTransaction(opts: {
  storeId:      number;
  type:         CreditTransactionType;
  amount:       number; // positive = credit added, negative = deducted
  description:  string;
  balanceAfter: number;
  referenceId?: string;
}): Promise<void> {
  try {
    await db.insert(platformCreditTransactions).values({
      storeId:      opts.storeId,
      type:         opts.type,
      amount:       opts.amount.toFixed(2),
      description:  opts.description,
      balanceAfter: opts.balanceAfter.toFixed(2),
      referenceId:  opts.referenceId ?? null,
      createdAt:    new Date(),
    } as any);
  } catch (err) {
    // Ledger failures must never break the primary operation — log and swallow.
    console.error("[creditLedger] Failed to log transaction:", err);
  }
}
