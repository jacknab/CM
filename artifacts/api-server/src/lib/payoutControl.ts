/** OAuth-connected Standard (Stripe Dashboard) accounts control their own payouts.
 * `payouts_enabled` says Stripe can send money to their bank; it does not grant
 * this platform permission to create a payout on their behalf. Only accounts
 * created and controlled by the platform may use the Certxa payout API. */
export function canCreateConnectedPayout(accountType: string | null | undefined): boolean {
  return accountType === "express" || accountType === "custom";
}

export const STANDARD_PAYOUT_MESSAGE =
  "Your Stripe account manages its own payouts. Open Stripe Dashboard → Balances → Payouts to send a payout or change its schedule. Certxa cannot initiate payouts for this connected account.";
