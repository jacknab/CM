import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  googleId: varchar("google_id"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("owner"), // "owner" | "manager" | "staff" (legacy: "admin" treated as owner)
  isAdmin: boolean("is_admin").notNull().default(false), // Platform-level superadmin flag — gates /isadmin/* routes
  staffId: integer("staff_id"), // Link to staff table if role is staff
  permissions: jsonb("permissions").$type<Record<string, boolean>>(), // Per-user permission overrides. Sparse — null/missing keys fall back to role defaults.
  onboardingCompleted: boolean("onboarding_completed").default(false),
  passwordChanged: boolean("password_changed").default(false), // Track if staff has changed their initial password
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // Trial / subscription fields (added via migration 0001_add_trial_fields.sql)
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("active"),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  // Account type — "tester" for temporary demo sessions, null/undefined = regular account
  accountType: varchar("account_type", { length: 32 }),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
