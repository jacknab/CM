/**
 * seed-store-nail-catalog.ts
 *
 * Applies the nail-salon catalog template to one store via seedNailSalonCatalog(),
 * then links every staff member of that store to the newly created services (the
 * onboarding flow normally does this step; a rebuild has to redo it).
 *
 * Used by scripts/rebuild-store2-nail-catalog.sh and available for manual
 * re-seeding. Run from the api-server package so the @shared alias and DB
 * config resolve:
 *
 *   cd artifacts/api-server && pnpm tsx ../../scripts/seed-store-nail-catalog.ts <storeId>
 *
 * Requires DATABASE_URL in the environment.
 */
import { eq } from "drizzle-orm";
import { seedNailSalonCatalog } from "../artifacts/api-server/src/lib/nailSalonSeed";
import { db } from "../artifacts/api-server/src/db";
import { staff, staffServices } from "../shared/schema";

async function main() {
  const storeId = Number(process.argv[2]);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    console.error("Usage: pnpm tsx scripts/seed-store-nail-catalog.ts <storeId>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  console.log(`\n💅  Applying nail-salon catalog template to store ${storeId}…\n`);
  const serviceIds = await seedNailSalonCatalog(storeId);

  // Re-link staff → services (onboarding does this after seeding; a rebuild must too)
  const storeStaff = await db.select({ id: staff.id }).from(staff).where(eq(staff.storeId, storeId));
  if (storeStaff.length > 0 && serviceIds.length > 0) {
    for (const member of storeStaff) {
      await db.delete(staffServices).where(eq(staffServices.staffId, member.id));
      await db.insert(staffServices).values(serviceIds.map((serviceId) => ({ staffId: member.id, serviceId })));
    }
    console.log(`✓ Linked ${storeStaff.length} staff member(s) to ${serviceIds.length} services.`);
  }

  console.log(`\n✓ Done — ${serviceIds.length} services created for store ${storeId}.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
