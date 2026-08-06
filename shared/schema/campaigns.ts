import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "../schema";

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  /**
   * Lifecycle statuses:
   *   draft          → saved, not yet submitted
   *   pending_review → under pre-flight + AI compliance check
   *   rejected       → failed pre-flight or AI review (see rejectionReason)
   *   sending        → approved, actively sending
   *   sent           → completed
   *   scheduled      → approved for future send
   */
  status: text("status").notNull().default("draft"),
  channel: text("channel").notNull().default("sms"),
  audience: text("audience").notNull().default("all"),
  audienceValue: text("audience_value"),
  messageTemplate: text("message_template").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  /** Human-readable reason stored when status = 'rejected'. */
  rejectionReason: text("rejection_reason"),
  /** When the compliance review completed (pass or fail). */
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_campaigns_store_id").on(t.storeId),
  index("idx_campaigns_status").on(t.status),
]);

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  store: one(locations, { fields: [campaigns.storeId], references: [locations.id] }),
}));
