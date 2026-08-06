import {
  pgTable, serial, text, integer, boolean, timestamp,
  index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { locations } from "../schema";

// ─── Feature Registry ─────────────────────────────────────────────────────────
// Master list of every capability the product can offer.
// `id` is a human-readable string key (e.g. 'sms_notifications').
// Only developers add rows here; admins configure which features belong to each plan.

export const features = pgTable("features", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  description: text("description"),
  category:    text("category").notNull().default("general"),
  isActive:    boolean("is_active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_features_category").on(t.category),
  index("idx_features_is_active").on(t.isActive),
]);

// ─── Subscription Plans ───────────────────────────────────────────────────────
// Configurable plan definitions. Admins control pricing and Stripe price IDs here.
// Feature entitlements are defined separately in plan_features.

export const subscriptionPlans = pgTable("subscription_plans", {
  id:                   serial("id").primaryKey(),
  code:                 text("code").notNull(),
  name:                 text("name").notNull(),
  description:          text("description"),
  priceMonthly:         integer("price_monthly_cents").notNull().default(0),
  priceYearly:          integer("price_yearly_cents").notNull().default(0),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly:  text("stripe_price_id_yearly"),
  isActive:             boolean("is_active").notNull().default(true),
  isPublic:             boolean("is_public").notNull().default(true),
  sortOrder:            integer("sort_order").notNull().default(0),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("subscription_plans_code_uidx").on(t.code),
  index("idx_subscription_plans_is_active").on(t.isActive),
  index("idx_subscription_plans_sort_order").on(t.sortOrder),
]);

// ─── Plan Features ────────────────────────────────────────────────────────────
// The critical mapping table — defines which features are included in each plan
// and what limit applies (NULL = unlimited, positive integer = hard cap).

export const planFeatures = pgTable("plan_features", {
  id:          serial("id").primaryKey(),
  planId:      integer("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  featureId:   text("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
  enabled:     boolean("enabled").notNull().default(true),
  limitValue:  integer("limit_value"),
  overageRateCents: integer("overage_rate_cents"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("plan_features_plan_feature_uidx").on(t.planId, t.featureId),
  index("idx_plan_features_plan_id").on(t.planId),
  index("idx_plan_features_feature_id").on(t.featureId),
]);

// ─── Store Subscriptions ──────────────────────────────────────────────────────
// Links a store to its active plan. status values: active | trialing | past_due |
// canceled | paused. To resolve active plan: filter WHERE status IN ('active','trialing')
// ORDER BY created_at DESC LIMIT 1.

export const storeSubscriptions = pgTable("store_subscriptions", {
  id:                   serial("id").primaryKey(),
  storeId:              integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  planId:               integer("plan_id").notNull().references(() => subscriptionPlans.id),
  status:               text("status").notNull().default("active"),
  currentPeriodStart:   timestamp("current_period_start"),
  currentPeriodEnd:     timestamp("current_period_end"),
  canceledAt:           timestamp("canceled_at"),
  cancelAtPeriodEnd:    boolean("cancel_at_period_end").notNull().default(false),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId:     text("stripe_customer_id"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
  updatedAt:            timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_store_subscriptions_store_id").on(t.storeId),
  index("idx_store_subscriptions_plan_id").on(t.planId),
  index("idx_store_subscriptions_status").on(t.status),
  index("idx_store_subscriptions_store_status").on(t.storeId, t.status),
]);

// ─── Feature Usage ────────────────────────────────────────────────────────────
// Tracks counted usage per store per feature per billing period.
// `period_start` is 'YYYY-MM-DD' (always the 1st of the month).
// Used for SMS quota enforcement, AI minutes, booking limits, etc.

export const featureUsage = pgTable("feature_usage", {
  id:            serial("id").primaryKey(),
  storeId:       integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  featureId:     text("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
  periodStart:   text("period_start").notNull(),
  usageCount:    integer("usage_count").notNull().default(0),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("feature_usage_store_feature_period_uidx").on(t.storeId, t.featureId, t.periodStart),
  index("idx_feature_usage_store_id").on(t.storeId),
  index("idx_feature_usage_feature_id").on(t.featureId),
]);

// ─── Relations ────────────────────────────────────────────────────────────────

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  planFeatures:       many(planFeatures),
  storeSubscriptions: many(storeSubscriptions),
}));

export const featuresRelations = relations(features, ({ many }) => ({
  planFeatures: many(planFeatures),
  featureUsage: many(featureUsage),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan:    one(subscriptionPlans, { fields: [planFeatures.planId], references: [subscriptionPlans.id] }),
  feature: one(features,          { fields: [planFeatures.featureId], references: [features.id] }),
}));

export const storeSubscriptionsRelations = relations(storeSubscriptions, ({ one }) => ({
  store: one(locations,          { fields: [storeSubscriptions.storeId], references: [locations.id] }),
  plan:  one(subscriptionPlans,  { fields: [storeSubscriptions.planId],  references: [subscriptionPlans.id] }),
}));

export const featureUsageRelations = relations(featureUsage, ({ one }) => ({
  store:   one(locations, { fields: [featureUsage.storeId],   references: [locations.id] }),
  feature: one(features,  { fields: [featureUsage.featureId], references: [features.id] }),
}));

// ─── Insert schemas ───────────────────────────────────────────────────────────

export const insertFeatureSchema = createInsertSchema(features);

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertPlanFeatureSchema = createInsertSchema(planFeatures).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertStoreSubscriptionSchema = createInsertSchema(storeSubscriptions).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertFeatureUsageSchema = createInsertSchema(featureUsage).omit({
  id: true, lastUpdatedAt: true,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Feature              = typeof features.$inferSelect;
export type InsertFeature        = typeof features.$inferInsert;
export type SubscriptionPlan     = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type PlanFeature          = typeof planFeatures.$inferSelect;
export type InsertPlanFeature    = typeof planFeatures.$inferInsert;
export type StoreSubscription    = typeof storeSubscriptions.$inferSelect;
export type InsertStoreSubscription = typeof storeSubscriptions.$inferInsert;
export type FeatureUsage         = typeof featureUsage.$inferSelect;
export type InsertFeatureUsage   = typeof featureUsage.$inferInsert;
