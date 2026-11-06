/**
 * Which plans an account may move to by itself (owner, 2026-11-06; plans/solo-web-dashboard.md).
 *
 * Solo and its Plus upgrade are only for accounts made in the Certxa Pro app (users.account_type certxa_pro), and
 * those accounts have no other plan: Plus is bought on the Solo billing pages (routes/soloPlus.ts). So:
 *  - a website (salon) account can't move to Solo or Plus;
 *  - an app account can't move to the salon plans (Starter, Professional, Enterprise …).
 * Platform admins setting a plan for a store (routes/plans.ts) are not limited by this.
 */
import { pool } from "../db";
import { isProAccount } from "@shared/proAccount";
import { isSoloPlanCode } from "@shared/soloPlan";

/** Why this store may not move to `planCode`, or null when it may. */
export async function planChangeRefusal(storeId: number, planCode: string | null | undefined): Promise<string | null> {
  const r = await pool.query(
    `SELECT u.account_type FROM locations l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = $1`,
    [storeId],
  );
  const appAccount = isProAccount(r.rows[0]?.account_type);
  const soloPlan = isSoloPlanCode(planCode);
  if (soloPlan && !appAccount) return "The Solo plan is only available in the Certxa Pro app.";
  if (!soloPlan && appAccount) return "Certxa Pro accounts can upgrade to Plus from the app's Billing page.";
  return null;
}
