// @ts-nocheck
/// <reference types="node" />
import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

// Recreate __dirname in ESM context for path joins
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: [
    path.join(__dirname, "./src/schema/index.ts"),
    path.join(__dirname, "../../shared/schema.ts"),
    path.join(__dirname, "../../shared/models/auth.ts"),
    path.join(__dirname, "../../shared/schema/billing.ts"),
    path.join(__dirname, "../../shared/schema/intelligence.ts"),
    path.join(__dirname, "../../shared/schema/clients.ts"),
    path.join(__dirname, "../../shared/schema/api-keys.ts"),
    path.join(__dirname, "../../shared/schema/campaigns.ts"),
    path.join(__dirname, "../../shared/schema/payouts.ts"),
    path.join(__dirname, "../../shared/schema/orphaned-tables.ts"),
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Exclude tables that are managed exclusively by the SQL migration runner
  // (runMigrations.ts / migrations/*.sql).  These tables are not defined in
  // any TypeScript schema file, so drizzle-kit push would wrongly flag them
  // for deletion every time it runs.  Add any new migration-only table here.
  //
  // Rule: if a table is created by a migrations/*.sql file but does NOT have
  // a pgTable() definition in a TypeScript schema file, add "!<table_name>"
  // to this list, or drizzle-kit push will offer to drop it on the next deploy.
  tablesFilter: [
    // Internal migration bookkeeping — never touch
    "!schema_migrations",
    // Migration-managed reassignment audit log (no TypeScript schema)
    "!booking_reassignment_log",
    // Platform-wide config (0005_platform_settings.sql)
    "!platform_settings",
    // Bulk data-transfer jobs table
    "!data_transfer_jobs",
    // Legacy sequence tied to data_transfer_jobs.id on some DBs
    // (drizzle push may otherwise try to drop it and fail with dependency errors)
    "!data_transfer_jobs_id_seq1",
    // Support back-office incident management tables
    "!support_escalations",
    "!support_macros",
    "!support_tasks",
    // Multilingual content translations (0074_entity_translations.sql)
    "!entity_translations",
    // Service review media matching table
    "!service_review_matches",
    "!service_image_auto_match_runs",
    // Platform email campaign / drip system tables
    "!platform_email_campaigns",
    "!platform_email_deliveries",
    "!platform_email_enrollments",
    "!platform_email_event_log",
    "!platform_email_events",
    "!platform_email_steps",
    "!platform_email_suppressions",
    // Bulk service import jobs (migration-only, no pgTable definition)
    "!service_import_jobs",
  ],
});
