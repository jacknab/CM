/**
 * One-off: move every contractor off legacy Stripe **Express** onboarding onto a
 * fresh recipient-configured **Custom** account. Bank details are NOT carried
 * over (external accounts can't move between accounts) — the owner or contractor
 * re-enters them afterward via the Bank tab / self-serve portal.
 *
 * Run (TEST keys/db first!):
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *     pnpm tsx ../../scripts/migrate-contractors-to-custom.ts [--dry]
 *
 * Idempotent: contractors already on account_type='custom' are skipped.
 */
import { ne, or, isNull, eq } from "drizzle-orm";
import { db } from "../artifacts/api-server/src/db";
import { contractors } from "../shared/schema";
import { createCustomContractorAccount } from "../artifacts/api-server/src/lib/stripeContractorAccounts";

const DRY = process.argv.includes("--dry");

async function main() {
  const rows = await db.select().from(contractors).where(
    or(ne(contractors.accountType, "custom"), isNull(contractors.accountType)),
  );
  console.log(`${rows.length} contractor(s) to migrate${DRY ? " (dry run)" : ""}.`);

  let ok = 0;
  const needsBank: string[] = [];
  for (const c of rows) {
    const label = `#${c.id} ${c.firstName ?? ""} ${c.lastName ?? ""} (store ${c.storeId})`;
    try {
      if (DRY) { console.log(`  would migrate ${label} (old acct ${c.stripeAccountId ?? "none"})`); ok++; needsBank.push(label); continue; }
      const oldAcct = c.stripeAccountId;
      const newAcct = await createCustomContractorAccount(c, null);
      // createCustomContractorAccount already flips account_type→custom,
      // bank_verified→false, onboarding_status→in_progress. Reset to 'pending'
      // since no bank is attached yet, and null any stale requirements.
      await db.update(contractors)
        .set({ onboardingStatus: "pending", requirementsDue: null })
        .where(eq(contractors.id, c.id));
      console.log(`  ${label}: ${oldAcct ?? "none"} → ${newAcct}`);
      needsBank.push(label);
      ok++;
    } catch (err: any) {
      console.error(`  ${label} FAILED:`, err?.raw?.message ?? err?.message ?? err);
    }
  }

  console.log(`\nDone. ${ok}/${rows.length} migrated.`);
  if (needsBank.length) {
    console.log(`\n${needsBank.length} contractor(s) now need bank details re-collected:`);
    needsBank.forEach((l) => console.log(`  - ${l}`));
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
