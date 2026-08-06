import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchasedSubdomainsTable = pgTable("wb_purchased_subdomains", {
  id: serial("id").primaryKey(),
  storeid: text("storeid").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  status: text("status").notNull().default("pending_payment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertPurchasedSubdomainSchema = createInsertSchema(purchasedSubdomainsTable).omit({ id: true, createdAt: true });
export type InsertPurchasedSubdomain = z.infer<typeof insertPurchasedSubdomainSchema>;
export type PurchasedSubdomain = typeof purchasedSubdomainsTable.$inferSelect;
