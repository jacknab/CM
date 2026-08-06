import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const websitesTable = pgTable("wb_websites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  storeid: text("storeid"),
  templateId: integer("template_id"),
  content: jsonb("content").notNull().default({}),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  customDomain: text("custom_domain"),
  customDomainStatus: text("custom_domain_status"), // null | 'pending_payment' | 'active'
  customDomainToken: text("custom_domain_token"), // random hex token used to verify domain ownership
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  assignedSubdomain: text("assigned_subdomain"),
  // SSL certificate provisioning state for custom domains
  // null | 'pending' | 'active' | 'failed' | 'skipped'
  sslStatus: text("ssl_status"),
  sslProvisionedAt: timestamp("ssl_provisioned_at", { withTimezone: true }),
  sslError: text("ssl_error"),
  // 'template' = existing block-editor flow | 'auto' = GlossGenius-style server-rendered page
  publisherType: text("publisher_type").notNull().default("template"),
  // JSONB settings for auto-mode: brandColor, tagline, sections, announcementBar, socialLinks
  autoSettings: jsonb("auto_settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Page view tracking for visitor analytics
export const pageViewsTable = pgTable("wb_page_views", {
  id: serial("id").primaryKey(),
  websiteId: integer("website_id").notNull().references(() => websitesTable.id, { onDelete: "cascade" }),
  path: text("path").default("/"),
  referrer: text("referrer"),
  ipHash: text("ip_hash"),    // SHA-256 of IP — no raw PII stored
  uaSnippet: text("ua_snippet"), // browser/device type bucket
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebsiteSchema = createInsertSchema(websitesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWebsite = z.infer<typeof insertWebsiteSchema>;
export type Website = typeof websitesTable.$inferSelect;

export const insertPageViewSchema = createInsertSchema(pageViewsTable).omit({ id: true, createdAt: true });
export type InsertPageView = z.infer<typeof insertPageViewSchema>;
export type PageView = typeof pageViewsTable.$inferSelect;
