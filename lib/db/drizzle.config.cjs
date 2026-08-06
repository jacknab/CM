// @ts-nocheck
// CommonJS variant of drizzle.config — used by drizzle-kit push.
// The lib/db package has "type": "module" in package.json, which causes
// drizzle-kit's jiti loader to emit ESM output and then fail when it tries to
// require() that output (Node rejects require() in an ESM context).  The .cjs
// extension hard-forces CommonJS mode regardless of "type": "module", so jiti
// always produces a CJS bundle that can be require()'d successfully.

const { defineConfig } = require("drizzle-kit");
const path = require("path");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set — ensure the database is provisioned");
}

module.exports = defineConfig({
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
  // Exclude tables managed exclusively by the SQL migration runner.
  // See drizzle.config.ts for full documentation of this list.
  tablesFilter: [
    "!schema_migrations",
    "!booking_reassignment_log",
    "!platform_settings",
    "!data_transfer_jobs",
    "!data_transfer_jobs_id_seq1",
    "!support_escalations",
    "!support_macros",
    "!support_tasks",
    "!entity_translations",
    "!service_review_matches",
    "!service_image_auto_match_runs",
    "!platform_email_campaigns",
    "!platform_email_deliveries",
    "!platform_email_enrollments",
    "!platform_email_event_log",
    "!platform_email_events",
    "!platform_email_steps",
    "!platform_email_suppressions",
    "!service_import_jobs",
    "!appointment_events",
    "!auth_events",
    "!email_log",
    "!service_events",
    "!account_health_checks",
  ],
});
