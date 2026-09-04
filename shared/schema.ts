import { pgTable, text, serial, integer, boolean, timestamp, decimal, index, uniqueIndex, unique, varchar, pgEnum, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";
import { users, sessions } from "./models/auth";
import { clients as _clients } from "./schema/clients";

// Re-export users and sessions for use with db schema
export { users, sessions };

// Re-export client data architecture tables
export {
  clients,
  clientEmails,
  clientPhones,
  clientAddresses,
  clientTags,
  clientTagRelationships,
  clientNotes,
  clientMarketingPreferences,
  clientCustomFields,
  clientCustomFieldValues,
  clientAuditLogs,
  clientExportJobs,
  clientImportJobs,
  insertClientSchema,
  insertClientEmailSchema,
  insertClientPhoneSchema,
  insertClientAddressSchema,
  insertClientTagSchema,
  insertClientNoteSchema,
} from "./schema/clients";
export type {
  Client,
  InsertClient,
  ClientEmail,
  ClientPhone,
  ClientAddress,
  ClientTag,
  ClientTagRelationship,
  ClientNote,
  ClientMarketingPreferences,
  ClientCustomField,
  ClientCustomFieldValue,
  ClientAuditLog,
  ClientExportJob,
  ClientImportJob,
  ClientWithDetails,
} from "./schema/clients";

// Re-export api-keys table so drizzle-kit includes it in db:push
export { apiKeys } from "./schema/api-keys";
export type { ApiKey, InsertApiKey } from "./schema/api-keys";

// Re-export campaigns table so drizzle-kit includes it in db:push
export { campaigns } from "./schema/campaigns";
export type { Campaign, InsertCampaign } from "./schema/campaigns";

// Re-export contractor payouts schema tables
export {
  commissionStructures,
  insertCommissionStructureSchema,
  contractors,
  contractorBankAccounts,
  payoutDeductionRules,
  payoutRuns,
  payoutRunItems,
  payoutChecks,
  payoutW9Records,
  payoutAuditLogs,
  payoutAdjustments,
  insertContractorSchema,
  insertContractorBankAccountSchema,
  insertPayoutDeductionRuleSchema,
  insertPayoutRunSchema,
  insertPayoutRunItemSchema,
  insertPayoutCheckSchema,
  insertPayoutW9RecordSchema,
  insertPayoutAuditLogSchema,
  insertPayoutAdjustmentSchema,
  contractorOnboardingTokens,
  contractorInstantTransfers,
  insertContractorInstantTransferSchema,
  accountCorporateAddresses,
  insertAccountCorporateAddressSchema,
  payrollPrintBatches,
  insertPayrollPrintBatchSchema,
  contractorCommissions,
  insertContractorCommissionSchema,
  staffCommissionAccruals,
  insertStaffCommissionAccrualSchema,
} from "./schema/payouts";
export type {
  CommissionStructure,
  InsertCommissionStructure,
  Contractor,
  InsertContractor,
  ContractorBankAccount,
  InsertContractorBankAccount,
  PayoutDeductionRule,
  InsertPayoutDeductionRule,
  PayoutRun,
  InsertPayoutRun,
  PayoutRunItem,
  InsertPayoutRunItem,
  PayoutCheck,
  InsertPayoutCheck,
  PayoutW9Record,
  InsertPayoutW9Record,
  PayoutAuditLog,
  InsertPayoutAuditLog,
  PayoutAdjustment,
  InsertPayoutAdjustment,
  ContractorOnboardingToken,
  ContractorInstantTransfer,
  InsertContractorInstantTransfer,
  AccountCorporateAddress,
  InsertAccountCorporateAddress,
  PayrollPrintBatch,
  InsertPayrollPrintBatch,
  ContractorCommission,
  InsertContractorCommission,
  StaffCommissionAccrual,
  InsertStaffCommissionAccrual,
} from "./schema/payouts";


// Re-export subscription system tables
export {
  features,
  subscriptionPlans,
  planFeatures,
  storeSubscriptions,
  featureUsage,
  insertFeatureSchema,
  insertSubscriptionPlanSchema,
  insertPlanFeatureSchema,
  insertStoreSubscriptionSchema,
  insertFeatureUsageSchema,
  subscriptionPlansRelations,
  featuresRelations,
  planFeaturesRelations,
  storeSubscriptionsRelations,
  featureUsageRelations,
} from "./schema/subscriptions";
export type {
  Feature,
  InsertFeature,
  SubscriptionPlan,
  InsertSubscriptionPlan,
  PlanFeature,
  InsertPlanFeature,
  StoreSubscription,
  InsertStoreSubscription,
  FeatureUsage,
  InsertFeatureUsage,
} from "./schema/subscriptions";

// === TABLE DEFINITIONS ===

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  category: text("category"),
  city: text("city"),
  state: text("state"),
  postcode: text("postcode"),
  bookingSlug: text("booking_slug").unique(),
  bookingTheme: text("booking_theme").default("simple"),
  commissionPayoutFrequency: text("commission_payout_frequency").default("monthly"),
  smsTokens: integer("sms_tokens").notNull().default(0),
  smsAllowance: integer("sms_allowance").notNull().default(0),
  smsCredits: integer("sms_credits").notNull().default(0),
  smsCreditsTotalPurchased: integer("sms_credits_total_purchased").notNull().default(0),
  userId: text("user_id").references(() => users.id),
  accountStatus: text("account_status").default("Active"),
  storeLatitude: text("store_latitude"),
  storeLongitude: text("store_longitude"),
  yelpAlias: text("yelp_alias"),
  facebookPageId: text("facebook_page_id"),
  lateGracePeriodMinutes: integer("late_grace_period_minutes").notNull().default(10),
  cancellationHoursCutoff: integer("cancellation_hours_cutoff").notNull().default(24),
  posEnabled: boolean("pos_enabled").notNull().default(true),
  weeklyDigestOptOut: boolean("weekly_digest_opt_out").notNull().default(false),
  parkingOptions: jsonb("parking_options").$type<string[]>().default([]),
  accessibilityFeatures: jsonb("accessibility_features").$type<string[]>().default([]),
  beverageOptions: jsonb("beverage_options").$type<{ complimentary: string[]; paid: string[] }>(),
  platformCredits: decimal("platform_credits", { precision: 10, scale: 2 }).notNull().default("0.00"),
  salesTaxRate: decimal("sales_tax_rate", { precision: 5, scale: 4 }).notNull().default("0.0000"),
  taxServicesTaxable: boolean("tax_services_taxable").notNull().default(false),
  taxAddonsTaxable: boolean("tax_addons_taxable").notNull().default(false),
  taxProductsTaxable: boolean("tax_products_taxable").notNull().default(true),
  taxGiftCardsTaxable: boolean("tax_gift_cards_taxable").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  registerTargetFloat: decimal("register_target_float", { precision: 10, scale: 2 }),
  autoRefillEnabled:   boolean("auto_refill_enabled").notNull().default(false),
  autoRefillThreshold: decimal("auto_refill_threshold", { precision: 10, scale: 2 }).notNull().default("5.00"),
  autoRefillAmount:    decimal("auto_refill_amount",    { precision: 10, scale: 2 }).notNull().default("25.00"),
  // ── Online booking payment policy ────────────────────────────────────────
  bookingPaymentPolicy: text("booking_payment_policy").notNull().default("none"),
  depositType:          text("deposit_type"),   // 'percentage' | 'fixed'
  depositValue:         decimal("deposit_value", { precision: 10, scale: 2 }),
  // ── Account lifecycle ─────────────────────────────────────────────────────
  suspendedAt:          timestamp("suspended_at"),
  suspendedReason:      text("suspended_reason"),
  lockedAt:             timestamp("locked_at"),
  // ── Online presence ───────────────────────────────────────────────────────
  website:              text("website"),
  // ── Onboarding ────────────────────────────────────────────────────────────
  setupComplete:        boolean("setup_complete").notNull().default(false),
});

export const businessHours = pgTable("business_hours", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  openTime: text("open_time").notNull().default("09:00"),
  closeTime: text("close_time").notNull().default("17:00"),
  isClosed: boolean("is_closed").notNull().default(false),
});

export const onboardingProgress = pgTable("onboarding_progress", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  flowKey: varchar("flow_key", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("not_started"),
  state: jsonb("state").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  skippedAt: timestamp("skipped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("onboarding_progress_store_id_flow_key_key").on(table.storeId, table.flowKey),
]);

export type OnboardingProgress = typeof onboardingProgress.$inferSelect;
export type InsertOnboardingProgress = typeof onboardingProgress.$inferInsert;

export const serviceCategories = pgTable("service_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  storeId: integer("store_id").references(() => locations.id),
  sortOrder: integer("sort_order").default(0),
  color: text("color"), // pastel key: lavender | periwinkle | peach | teal | lemon | sky | mint
  hiddenFromPublic: boolean("hidden_from_public").default(false),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  duration: integer("duration").notNull(),
  // How long the appointment takes (minutes). Affects scheduling.
  // ── NOT to be confused with `longevity` below. ──
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  // How long the service result typically lasts before the client would need it
  // redone, as free text (e.g. "3 weeks", "3–4 weeks"). Nullable. This is purely
  // informational — it does NOT affect appointment length, scheduling, or availability.
  longevity: text("longevity"),
  categoryId: integer("category_id").references(() => serviceCategories.id),
  imageUrl: text("image_url"),
  storeId: integer("store_id").references(() => locations.id),
  depositRequired: boolean("deposit_required").default(false),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  illustrationCategoryId: integer("illustration_category_id"),
  customIllustrationUrl: text("custom_illustration_url"),
  autoAssigned: boolean("auto_assigned").default(false),
  isActive: boolean("is_active").notNull().default(true),
  hiddenFromPublic: boolean("hidden_from_public").default(false),
});

export const serviceOptions = pgTable("service_options", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").references(() => services.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const addons = pgTable("addons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  imageUrl: text("image_url"),
  storeId: integer("store_id").references(() => locations.id),
  // --- conflict resolution / tiered add-on system ---
  type: text("type").notNull().default("full"),        // "full" | "mini" | "express"
  parentAddonId: integer("parent_addon_id"),            // mini/express → full parent
  isStackable: boolean("is_stackable").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  hiddenFromPublic: boolean("hidden_from_public").default(false),
});

export const serviceAddons = pgTable("service_addons", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").references(() => services.id).notNull(),
  addonId: integer("addon_id").references(() => addons.id).notNull(),
});

export const appointmentAddons = pgTable("appointment_addons", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").references(() => appointments.id).notNull(),
  addonId: integer("addon_id").references(() => addons.id).notNull(),
});

// ── Packages ────────────────────────────────────────────────────────────────
// A package bundles existing services + add-ons into one named item. Duration
// is always the sum of the components; price is that sum ('sum') or a fixed
// owner-set amount ('fixed'). A booked package is a single appointment with
// `packageId` set (see appointments.packageId) and the package's add-ons
// attached as normal appointment_addons rows.
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  pricingMode: text("pricing_mode").notNull().default("sum"), // "sum" | "fixed"
  fixedPrice: decimal("fixed_price", { precision: 10, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  hiddenFromPublic: boolean("hidden_from_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const packageItems = pgTable("package_items", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").references(() => packages.id).notNull(),
  itemType: text("item_type").notNull(),                     // "service" | "addon"
  serviceId: integer("service_id").references(() => services.id),
  addonId: integer("addon_id").references(() => addons.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").default("stylist"),
  bio: text("bio"),
  color: text("color").default("#3b82f6"),
  avatarUrl: text("avatar_url"),
  avatarThumbUrl: text("avatar_thumb_url"),
  commissionEnabled: boolean("commission_enabled").default(false),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("0"),
  productCommissionRate: decimal("product_commission_rate", { precision: 5, scale: 2 }).default("0"),
  commissionStructureId: integer("commission_structure_id"),
  storeId: integer("store_id").references(() => locations.id),
  permissions: jsonb("permissions").$type<Record<string, boolean>>(),
  // Team management additions
  status: text("status").default("active"),           // active | invited | deactivated | removed
  employmentType: text("employment_type").default("stylist"), // stylist | booth_renter | receptionist | assistant | manager | marketer | accountant | owner | custom
  showOnCalendar: boolean("show_on_calendar").default(true), // false = excluded from calendar "all" view (owners default to false)
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at"),
  removedAt: timestamp("removed_at"),
  invitedByUserId: text("invited_by_user_id"),
  // 1099 mailing address (self-reported by staff)
  mailingAddress1: text("mailing_address1"),
  mailingAddress2: text("mailing_address2"),
  mailingCity:     text("mailing_city"),
  mailingState:    text("mailing_state"),
  mailingZip:      text("mailing_zip"),
  mailingCountry:  text("mailing_country").default("US"),
});

export const staffServices = pgTable("staff_services", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staff.id).notNull(),
  serviceId: integer("service_id").references(() => services.id).notNull(),
});

export const staffAvailability = pgTable("staff_availability", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staff.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
});

// customers table removed — all client data lives in the `clients` table.
// The storage layer still exposes a Customer/InsertCustomer compatibility shim
// (defined below) so existing API routes keep working without a rename.

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  // TIMESTAMPTZ — all appointment times are stored in UTC.
  // The API always converts salon-local input via fromZonedTime() before storage,
  // and returns UTC ISO-8601 strings. Display conversion is done client-side
  // using the store's IANA timezone (locations.timezone).
  date: timestamp("date", { withTimezone: true }).notNull(),
  duration: integer("duration").notNull(),
  status: text("status").default("pending"),
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  paymentMethod: text("payment_method"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  totalPaid: decimal("total_paid", { precision: 10, scale: 2 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  serviceId: integer("service_id").references(() => services.id),
  staffId: integer("staff_id").references(() => staff.id),
  customerId: integer("customer_id"),
  storeId: integer("store_id").references(() => locations.id),
  recurrenceRule: text("recurrence_rule"),
  recurrenceParentId: integer("recurrence_parent_id"),
  depositRequired: boolean("deposit_required").default(false),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  depositPaid: boolean("deposit_paid").default(false),
  giftCardId: integer("gift_card_id"),
  giftCardAmount: decimal("gift_card_amount", { precision: 10, scale: 2 }),
  loyaltyPointsEarned: integer("loyalty_points_earned").default(0),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
  clientRequestedStaff: boolean("client_requested_staff").default(false),
  calendarHidden: boolean("calendar_hidden").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // ── Payment tracking (set at booking time) ────────────────────────────────
  paymentPolicy:           text("payment_policy").notNull().default("none"),
  depositCollected:        decimal("deposit_collected", { precision: 10, scale: 2 }),
  remainingBalance:        decimal("remaining_balance", { precision: 10, scale: 2 }),
  stripePaymentIntentId:   text("stripe_payment_intent_id"),
  stripeSetupIntentId:     text("stripe_setup_intent_id"),
  stripeCustomerIdApt:     text("stripe_customer_id"),
  stripePaymentMethodIdApt: text("stripe_payment_method_id"),
  paymentStatus:           text("payment_status").notNull().default("none"),
  resourceId:              integer("resource_id").references(() => salonResources.id),
  // ── Commission reproducibility snapshot (set once, at first completion) ────
  // Captured so commission reports / payroll runs don't move when a service
  // price or a staff commission rate is edited later. NULL on historical rows —
  // consumers fall back to the live value when absent. See migration 0156.
  servicePrice:            decimal("service_price", { precision: 10, scale: 2 }),
  commissionRate:          decimal("commission_rate", { precision: 5, scale: 2 }),
  // Set when this appointment was booked as a Catalog Package (see packages).
  // serviceId still points at the package's primary service so existing
  // scheduling / calendar / commission code is unaffected.
  packageId:               integer("package_id").references(() => packages.id),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  purchasePrice: decimal("purchase_price", { precision: 10, scale: 2 }),
  stock: integer("stock").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  category: text("category"),
  upc: text("upc"),
  storeId: integer("store_id").references(() => locations.id),
});

export const cashDrawerSessions = pgTable("cash_drawer_sessions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  openingBalance: decimal("opening_balance", { precision: 10, scale: 2 }).notNull().default("0.00"),
  closingBalance: decimal("closing_balance", { precision: 10, scale: 2 }),
  denominationBreakdown: text("denomination_breakdown"),
  openingDenominationBreakdown: text("opening_denomination_breakdown"),
  reportedCardSales: decimal("reported_card_sales", { precision: 10, scale: 2 }),
  priorClosingMismatch: boolean("prior_closing_mismatch").notNull().default(false),
  priorClosingVariance: decimal("prior_closing_variance", { precision: 10, scale: 2 }),
  priorClosingResolvedBy: text("prior_closing_resolved_by"),
  priorClosingResolvedAt: timestamp("prior_closing_resolved_at"),
  priorClosingResolutionNotes: text("prior_closing_resolution_notes"),
  status: text("status").notNull().default("open"),
  openedBy: text("opened_by"),
  closedBy: text("closed_by"),
  notes: text("notes"),
});

export const calendarSettings = pgTable("calendar_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  startOfWeek: text("start_of_week").notNull().default("monday"),
  timeSlotInterval: integer("time_slot_interval").notNull().default(15),
  nonWorkingHoursDisplay: integer("non_working_hours_display").notNull().default(1),
  allowBookingOutsideHours: boolean("allow_booking_outside_hours").notNull().default(true),
  autoCompleteAppointments: boolean("auto_complete_appointments").notNull().default(true),
  autoMarkNoShows: boolean("auto_mark_no_shows").notNull().default(false),
  showPrices: boolean("show_prices").notNull().default(true),
  walkInsEnabled: boolean("walk_ins_enabled").notNull().default(true),
  language: text("language").notNull().default("en"),
});

export const drawerActions = pgTable("drawer_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => cashDrawerSessions.id).notNull(),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  reason: text("reason"),
  performedBy: text("performed_by"),
  performedAt: timestamp("performed_at").notNull(),
});

// Business Day cash reconciliation system — replaces shift-based cash_drawer_sessions
// as the active model. One BusinessDay per calendar date per salon, keyed to the
// salon's own timezone (never server/UTC time) so midnight boundaries always match
// the physical location, not the datacenter.
export const businessDays = pgTable("business_days", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD in the store's local timezone
  status: text("status").notNull().default("not_started"), // not_started | open | pending_reconciliation | reconciled
  openingFloat: decimal("opening_float", { precision: 10, scale: 2 }),
  expectedCash: decimal("expected_cash", { precision: 10, scale: 2 }),
  countedCash: decimal("counted_cash", { precision: 10, scale: 2 }),
  cashSales: decimal("cash_sales", { precision: 10, scale: 2 }).notNull().default("0.00"),
  cardSales: decimal("card_sales", { precision: 10, scale: 2 }).notNull().default("0.00"),
  tips: decimal("tips", { precision: 10, scale: 2 }).notNull().default("0.00"),
  overShortAmount: decimal("over_short_amount", { precision: 10, scale: 2 }),
  denominationBreakdown: text("denomination_breakdown"),
  openedAt: timestamp("opened_at"),
  openedBy: text("opened_by"),
  reconciledAt: timestamp("reconciled_at"),
  reconciledBy: text("reconciled_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  storeDateUnique: uniqueIndex("business_days_store_date_unique").on(table.storeId, table.date),
}));

// Audit log for the Business Day lifecycle: BUSINESS_DAY_OPENED, BUSINESS_DAY_RECONCILED,
// CASH_COUNT_SUBMITTED, plus mid-day cash_in/cash_out register events.
export const businessDayActions = pgTable("business_day_actions", {
  id: serial("id").primaryKey(),
  businessDayId: integer("business_day_id").references(() => businessDays.id).notNull(),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  reason: text("reason"),
  performedBy: text("performed_by"),
  performedAt: timestamp("performed_at").notNull(),
});

export const smsSettings = pgTable("sms_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  bookingConfirmationEnabled: boolean("booking_confirmation_enabled").notNull().default(false),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderHoursBefore: integer("reminder_hours_before").notNull().default(24),
  reviewRequestEnabled: boolean("review_request_enabled").notNull().default(false),
  googleReviewUrl: text("google_review_url"),
  confirmationTemplate: text("confirmation_template").default("Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!"),
  reminderTemplate: text("reminder_template").default("Hi {customerName}, this is a reminder of your appointment at {storeName} tomorrow at {appointmentTime}. Reply STOP to opt out."),
  reviewTemplate: text("review_template").default("Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. Leave us a review: {reviewUrl}"),
  autoEngageEnabled: boolean("auto_engage_enabled").notNull().default(true),
  smsCancellationEnabled: boolean("sms_cancellation_enabled").notNull().default(true),
});

export const smsLog = pgTable("sms_log", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  customerId: integer("customer_id").references(() => _clients.id),
  phone: text("phone").notNull(),
  messageType: text("message_type").notNull(),
  messageBody: text("message_body").notNull(),
  status: text("status").notNull().default("pending"),
  twilioSid: text("twilio_sid"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull(),
  smsSource: text("sms_source"),
  costEstimate: decimal("cost_estimate", { precision: 10, scale: 4 }).default("0.0100"),
});

export const mailSettings = pgTable("mail_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  mailgunApiKey: text("mailgun_api_key"),
  mailgunDomain: text("mailgun_domain"),
  senderEmail: text("sender_email"),
  bookingConfirmationEnabled: boolean("booking_confirmation_enabled").notNull().default(false),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderHoursBefore: integer("reminder_hours_before").notNull().default(24),
  reviewRequestEnabled: boolean("review_request_enabled").notNull().default(false),
  googleReviewUrl: text("google_review_url"),
  confirmationTemplate: text("confirmation_template").default(`<p>Hi {customerName},</p>
<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>
<p>See you then!</p>`),
  reminderTemplate: text("reminder_template").default(`<p>Hi {customerName},</p>
<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>
<p>Reply to this email to confirm or cancel.</p>`),
  reviewTemplate: text("review_template").default(`<p>Hi {customerName},</p>
<p>Thank you for visiting {storeName}! We'd love your feedback.</p>
<p><a href="{reviewUrl}">Leave us a review</a></p>`),
});




// === PERMISSIONS (from osx) ===

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("permissions_store_id_idx").on(table.storeId),
}));

// === ROLES (from osx) ===

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("roles_store_id_idx").on(table.storeId),
  nameStoreIdx: index("roles_name_store_idx").on(table.name, table.storeId),
}));

// === APPS (from osx) ===

export const apps = pgTable("app", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  appName: text("app_name").notNull(),
  active: boolean("active").default(false),
  activeDate: timestamp("active_date"),
  userPin: text("user_pin"),
  permissions: integer("permissions"),
}, (table) => ({
  storeIdIdx: index("app_store_id_idx").on(table.storeId),
  storeAppUnique: index("app_store_app_unique_idx").on(table.storeId, table.appName),
}));

// === STAFF SETTINGS (from osx) ===

export const staffSettings = pgTable("staff_settings", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staff.id).notNull(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  preferences: text("preferences").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  staffIdIdx: uniqueIndex("staff_settings_staff_id_uidx").on(table.staffId),
  storeIdIdx: index("staff_settings_store_id_idx").on(table.storeId),
}));

// === STAFF PIN CODES (Time Clock) ===

export const staffPins = pgTable("staff_pins", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staff.id, { onDelete: "cascade" }).notNull(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  pin: text("pin").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  storePinUdx: uniqueIndex("sp_store_pin_uidx").on(table.storeId, table.pin),
  staffStoreUdx: uniqueIndex("sp_staff_store_uidx").on(table.staffId, table.storeId),
}));

// === TIME CLOCK (Clock In / Out) ===

export const timeclock = pgTable("timeclock", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staff.id, { onDelete: "cascade" }).notNull(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  clockIn: timestamp("clock_in").defaultNow().notNull(),
  clockOut: timestamp("clock_out"),
  workDate: text("work_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  staffDateIdx: index("tc_staff_date_idx").on(table.staffId, table.workDate),
  storeDateIdx: index("tc_store_date_idx").on(table.storeId, table.workDate),
}));

// === STORE SETTINGS (from osx) ===

export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  preferences: text("preferences").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: uniqueIndex("store_settings_store_id_uidx").on(table.storeId),
}));

// === GOOGLE BUSINESS PROFILE INTEGRATION ===

export const googleBusinessProfiles = pgTable("google_business_profiles", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  googleAccountEmail: text("google_account_email"),
  businessName: text("business_name"),
  businessAccountId: text("business_account_id"),
  businessAccountResourceName: text("business_account_resource_name"),
  locationId: text("location_id"),
  locationResourceName: text("location_resource_name"),
  locationAddress: text("location_address"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  isConnected: boolean("is_connected").default(false),
  syncEnabled: boolean("sync_enabled").default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  listingSyncedAt: timestamp("listing_synced_at"),
  listingBookingUrl: text("listing_booking_url"),
  googleReviewLink: text("google_review_link"),
  verificationStatus: text("verification_status").default("verified"),
  onboardingStatus: text("onboarding_status").notNull().default("not_started"),
  discoveredPlaceId: text("discovered_place_id"),
  postcardSentAt: timestamp("postcard_sent_at", { withTimezone: true }),
  postcardAddress: text("postcard_address"),
  postcardReminderSentAt: timestamp("postcard_reminder_sent_at", { withTimezone: true }),
  postcardSecondReminderSentAt: timestamp("postcard_second_reminder_sent_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  onboardingAbandonedAt: timestamp("onboarding_abandoned_at", { withTimezone: true }),
  onboardingError: text("onboarding_error"),
  // ── Auth failure tracking ─────────────────────────────────────────────────
  // Set when the worker detects that the refresh token has been revoked/expired.
  // Cleared automatically when the owner completes a new OAuth flow.
  reconnectRequired: boolean("reconnect_required").notNull().default(false),
  authFailureAt: timestamp("auth_failure_at", { withTimezone: true }),
  authFailureReason: text("auth_failure_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("google_business_profiles_store_id_idx").on(table.storeId),
  storeIdUnique: uniqueIndex("google_business_profiles_store_id_uidx").on(table.storeId),
}));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE BUSINESS ACCOUNTS
// One row per connected Google Business account per store.
// Owns all OAuth tokens. NEVER mixed with the Google Login system.
// ─────────────────────────────────────────────────────────────────────────────
export const googleBusinessAccounts = pgTable("google_business_accounts", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  googleAccountId: text("google_account_id").notNull(), // resource name e.g. "accounts/123456789"
  accountName: text("account_name"),                    // human-readable name from Google API
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  scopes: text("scopes"),                               // space-separated granted scopes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  gbaStoreIdIdx:          index("gba_store_id_idx").on(table.storeId),
  gbaUserIdIdx:           index("gba_user_id_idx").on(table.userId),
  gbaGoogleAccountIdIdx:  index("gba_google_account_id_idx").on(table.googleAccountId),
}));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE BUSINESS LOCATIONS
// Individual physical locations per Google Business account.
// Reviews MUST always be tied to a location, never to an account.
// ─────────────────────────────────────────────────────────────────────────────
export const googleBusinessLocations = pgTable("google_business_locations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  businessAccountId: integer("business_account_id").references(() => googleBusinessAccounts.id).notNull(),
  locationResourceName: text("location_resource_name").notNull(), // full resource e.g. "accounts/123/locations/456"
  locationId: text("location_id").notNull(),                       // extracted leaf ID "456"
  locationName: text("location_name"),                             // human-readable business name
  address: text("address"),
  phone: text("phone"),
  isSelected: boolean("is_selected").default(false),               // only ONE active per storeId
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  gblStoreIdIdx:              index("gbl_store_id_idx").on(table.storeId),
  gblUserIdIdx:               index("gbl_user_id_idx").on(table.userId),
  gblBusinessAccountIdIdx:    index("gbl_business_account_id_idx").on(table.businessAccountId),
  gblLocationResourceNameUdx: uniqueIndex("gbl_location_resource_name_uidx").on(table.locationResourceName),
}));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE BUSINESS SYNC LOGS
// Tracks every review-sync + location-fetch operation for debugging.
// status: "success" | "failed"   syncType: "reviews" | "locations"
// ─────────────────────────────────────────────────────────────────────────────
export const googleBusinessSyncLogs = pgTable("google_business_sync_logs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id),
  userId: varchar("user_id").references(() => users.id),
  locationId: integer("location_id").references(() => googleBusinessLocations.id),
  syncType: text("sync_type").notNull(),   // "reviews" | "locations"
  status: text("status").notNull(),         // "success" | "failed"
  errorMessage: text("error_message"),
  reviewsSynced: integer("reviews_synced"),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => ({
  gbslStoreIdIdx:   index("gbsl_store_id_idx").on(table.storeId),
  gbslLocationIdx:  index("gbsl_location_id_idx").on(table.locationId),
  gbslSyncedAtIdx:  index("gbsl_synced_at_idx").on(table.syncedAt),
}));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE REVIEWS  (now with proper FK to googleBusinessLocations)
// ─────────────────────────────────────────────────────────────────────────────
export const googleReviews = pgTable("google_reviews", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  googleReviewId: text("google_review_id").unique().notNull(),
  googleLocationId: text("google_location_id"),       // legacy plain-text location ID (kept for compat)
  gbLocationId: integer("gb_location_id").references(() => googleBusinessLocations.id), // proper FK
  customerName: text("customer_name"),
  customerPhoneNumber: text("customer_phone_number"),
  rating: integer("rating").notNull(),
  reviewText: text("review_text"),
  reviewImageUrls: text("review_image_urls"), // JSON array stored as text
  reviewerPhotoUrl: text("reviewer_photo_url"),
  googleReviewResourceName: text("google_review_resource_name"),
  reviewMediaItems: jsonb("review_media_items"),
  ownerReply: jsonb("owner_reply"),
  reviewReplyUrl: text("review_reply_url"),
  reviewCreateTime: timestamp("review_create_time"),
  reviewUpdateTime: timestamp("review_update_time"),
  reviewerLanguageCode: text("reviewer_language_code"),
  reviewPublishingStatus: text("review_publishing_status").default("published"),
  responseStatus: text("response_status").default("not_responded"),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  customerId: integer("customer_id").references(() => _clients.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  storeIdIdx: index("google_reviews_store_id_idx").on(table.storeId),
  googleReviewIdIdx: index("google_reviews_google_review_id_idx").on(table.googleReviewId),
  ratingIdx: index("google_reviews_rating_idx").on(table.rating),
  responseStatusIdx: index("google_reviews_response_status_idx").on(table.responseStatus),
}));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SERVICE SYNC SETTINGS
// Per-store policy for keeping GBP services in sync with Certxa services.
// ─────────────────────────────────────────────────────────────────────────────
export const googleServiceSyncSettings = pgTable("google_service_sync_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull().unique(),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  syncName: boolean("sync_name").notNull().default(true),
  syncDescription: boolean("sync_description").notNull().default(true),
  syncPrice: boolean("sync_price").notNull().default(true),
  syncAddNew: boolean("sync_add_new").notNull().default(true),
  syncRemoveDeleted: boolean("sync_remove_deleted").notNull().default(false),
  syncMode: text("sync_mode").notNull().default("auto"),  // 'auto' | 'manual'
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncStatus: text("last_sync_status"),  // 'success' | 'failed' | null
  lastSyncError: text("last_sync_error"),
  lastSyncCount: integer("last_sync_count"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  gsssStoreIdIdx: index("gsss_store_id_idx").on(table.storeId),
}));

export const googleReviewResponses = pgTable("google_review_responses", {
  id: serial("id").primaryKey(),
  googleReviewId: integer("google_review_id").references(() => googleReviews.id).notNull(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  responseText: text("response_text").notNull(),
  responseStatus: text("response_status").notNull(), // "pending", "approved", "rejected"
  staffId: integer("staff_id").references(() => staff.id),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  googleReviewIdIdx: index("google_review_responses_google_review_id_idx").on(table.googleReviewId),
  storeIdIdx: index("google_review_responses_store_id_idx").on(table.storeId),
  responseStatusIdx: index("google_review_responses_response_status_idx").on(table.responseStatus),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === WAITLIST ===

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  serviceId: integer("service_id").references(() => services.id),
  staffId: integer("staff_id").references(() => staff.id),
  customerId: integer("customer_id").references(() => _clients.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  preferredDate: timestamp("preferred_date"),
  preferredTimeStart: text("preferred_time_start"),
  preferredTimeEnd: text("preferred_time_end"),
  notes: text("notes"),
  partySize: integer("party_size").default(1),
  status: text("status").default("waiting"),
  notifiedAt: timestamp("notified_at"),
  calledAt: timestamp("called_at"),
  completedAt: timestamp("completed_at"),
  customerLatitude: text("customer_latitude"),
  customerLongitude: text("customer_longitude"),
  smsSentAt: timestamp("sms_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === GIFT CARDS ===

export const giftCards = pgTable("gift_cards", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  code: text("code").notNull().unique(),
  originalAmount: decimal("original_amount", { precision: 10, scale: 2 }).notNull(),
  remainingBalance: decimal("remaining_balance", { precision: 10, scale: 2 }).notNull(),
  issuedToName: text("issued_to_name"),
  issuedToEmail: text("issued_to_email"),
  purchasedByCustomerId: integer("purchased_by_customer_id").references(() => _clients.id),
  recipientCustomerId: integer("recipient_customer_id").references(() => _clients.id),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  notes: text("notes"),
});

export const giftCardTransactions = pgTable("gift_card_transactions", {
  id: serial("id").primaryKey(),
  giftCardId: integer("gift_card_id").references(() => giftCards.id).notNull(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === INTAKE FORMS ===

export const intakeForms = pgTable("intake_forms", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  requireBeforeBooking: boolean("require_before_booking").default(false),
  serviceId: integer("service_id").references(() => services.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const intakeFormFields = pgTable("intake_form_fields", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => intakeForms.id).notNull(),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull(),
  options: text("options"),
  required: boolean("required").default(false),
  sortOrder: integer("sort_order").default(0),
});

export const intakeFormResponses = pgTable("intake_form_responses", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").references(() => intakeForms.id).notNull(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  customerId: integer("customer_id").references(() => _clients.id),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  customerName: text("customer_name"),
  responses: text("responses").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

// === LOYALTY ===

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  customerId: integer("customer_id").references(() => _clients.id).notNull(),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  type: text("type").notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Owner-defined rewards catalogue. Each reward is "spend N points → $X off".
// Earning rate (points per $1) lives in store_settings.preferences.loyalty.
export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  pointsCost: integer("points_cost").notNull(),
  dollarValue: decimal("dollar_value", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SMS OPT-OUTS ===

export const smsOptOuts = pgTable("sms_opt_outs", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  optedOutAt: timestamp("opted_out_at").defaultNow(),
  optedBackInAt: timestamp("opted_back_in_at"),
  isOptedOut: boolean("is_opted_out").notNull().default(true),
});

// === PRO HUB TABLES ===

export const proLeads = pgTable("pro_leads", {
  id:           serial("id").primaryKey(),
  name:         varchar("name",          { length: 255 }).notNull(),
  email:        varchar("email",         { length: 255 }).notNull(),
  phone:        varchar("phone",         { length: 50 }),
  businessName: varchar("business_name", { length: 255 }),
  industry:     varchar("industry",      { length: 100 }),
  teamSize:     varchar("team_size",     { length: 50 }),
  message:      text("message"),
  source:       varchar("source",        { length: 100 }).default("pro-hub"),
  createdAt:    timestamp("created_at").defaultNow(),
});

export const insertProLeadSchema = createInsertSchema(proLeads);

// === SEO REGIONAL PAGES ===

export const seoRegions = pgTable("seo_regions", {
  id:            serial("id").primaryKey(),
  city:          varchar("city",           { length: 100 }).notNull(),
  state:         varchar("state",          { length: 100 }).notNull(),
  stateCode:     varchar("state_code",     { length: 10 }).notNull(),
  slug:          varchar("slug",           { length: 200 }).notNull().unique(),
  phone:         varchar("phone",          { length: 30 }),
  zip:           varchar("zip",            { length: 20 }),
  product:       varchar("product",        { length: 20 }).notNull().default("booking"),
  businessType:  varchar("business_type",  { length: 100 }),
  businessTypes: text("business_types"),
  nearbyCities:  text("nearby_cities"),
  metaTitle:     text("meta_title"),
  metaDesc:      text("meta_desc"),
  h1Override:    text("h1_override"),
  pageGenerated: boolean("page_generated").default(false),
  createdAt:     timestamp("created_at").defaultNow(),
  updatedAt:     timestamp("updated_at").defaultNow(),
});

export const insertSeoRegionSchema = createInsertSchema(seoRegions).omit({ id: true, createdAt: true, updatedAt: true, pageGenerated: true });
export type SeoRegion = typeof seoRegions.$inferSelect;
export type InsertSeoRegion = typeof seoRegions.$inferInsert;

// === RELATIONS ===

export const locationsRelations = relations(locations, ({ many }) => ({
  services: many(services),
  staff: many(staff),
  appointments: many(appointments),
  products: many(products),
  serviceCategories: many(serviceCategories),
  addons: many(addons),
  cashDrawerSessions: many(cashDrawerSessions),
  calendarSettings: many(calendarSettings),
  businessHours: many(businessHours),
  smsSettings: many(smsSettings),
  smsLogs: many(smsLog),
  mailSettings: many(mailSettings),
  permissions: many(permissions),
  roles: many(roles),
  apps: many(apps),
  staffSettings: many(staffSettings),
  storeSettings: many(storeSettings),
  googleBusinessProfiles: many(googleBusinessProfiles),
  googleReviews: many(googleReviews),
  googleReviewResponses: many(googleReviewResponses),
  waitlist: many(waitlist),
  giftCards: many(giftCards),
  intakeForms: many(intakeForms),
  loyaltyTransactions: many(loyaltyTransactions),
}));

export const smsSettingsRelations = relations(smsSettings, ({ one }) => ({
  store: one(locations, { fields: [smsSettings.storeId], references: [locations.id] }),
}));

export const mailSettingsRelations = relations(mailSettings, ({ one }) => ({
  store: one(locations, { fields: [mailSettings.storeId], references: [locations.id] }),
}));

export const smsLogRelations = relations(smsLog, ({ one }) => ({
  store: one(locations, { fields: [smsLog.storeId], references: [locations.id] }),
  appointment: one(appointments, { fields: [smsLog.appointmentId], references: [appointments.id] }),
  customer: one(_clients, { fields: [smsLog.customerId], references: [_clients.id] }),
}));

export const businessHoursRelations = relations(businessHours, ({ one }) => ({
  store: one(locations, { fields: [businessHours.storeId], references: [locations.id] }),
}));

export const calendarSettingsRelations = relations(calendarSettings, ({ one }) => ({
  store: one(locations, { fields: [calendarSettings.storeId], references: [locations.id] }),
}));

export const cashDrawerSessionsRelations = relations(cashDrawerSessions, ({ one, many }) => ({
  store: one(locations, { fields: [cashDrawerSessions.storeId], references: [locations.id] }),
  actions: many(drawerActions),
}));

export const drawerActionsRelations = relations(drawerActions, ({ one }) => ({
  session: one(cashDrawerSessions, { fields: [drawerActions.sessionId], references: [cashDrawerSessions.id] }),
}));

export const businessDaysRelations = relations(businessDays, ({ one, many }) => ({
  store: one(locations, { fields: [businessDays.storeId], references: [locations.id] }),
  actions: many(businessDayActions),
}));

export const businessDayActionsRelations = relations(businessDayActions, ({ one }) => ({
  businessDay: one(businessDays, { fields: [businessDayActions.businessDayId], references: [businessDays.id] }),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({ one, many }) => ({
  store: one(locations, { fields: [serviceCategories.storeId], references: [locations.id] }),
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  store: one(locations, { fields: [services.storeId], references: [locations.id] }),
  serviceCategory: one(serviceCategories, { fields: [services.categoryId], references: [serviceCategories.id] }),
  serviceAddons: many(serviceAddons),
  staffServices: many(staffServices),
  options: many(serviceOptions),
}));

export const serviceOptionsRelations = relations(serviceOptions, ({ one }) => ({
  service: one(services, { fields: [serviceOptions.serviceId], references: [services.id] }),
}));

export const addonsRelations = relations(addons, ({ one, many }) => ({
  store: one(locations, { fields: [addons.storeId], references: [locations.id] }),
  serviceAddons: many(serviceAddons),
  appointmentAddons: many(appointmentAddons),
  parentAddon: one(addons, { fields: [addons.parentAddonId], references: [addons.id], relationName: "addon_variants" }),
  variants: many(addons, { relationName: "addon_variants" }),
}));

export const serviceAddonsRelations = relations(serviceAddons, ({ one }) => ({
  service: one(services, { fields: [serviceAddons.serviceId], references: [services.id] }),
  addon: one(addons, { fields: [serviceAddons.addonId], references: [addons.id] }),
}));

export const appointmentAddonsRelations = relations(appointmentAddons, ({ one }) => ({
  appointment: one(appointments, { fields: [appointmentAddons.appointmentId], references: [appointments.id] }),
  addon: one(addons, { fields: [appointmentAddons.addonId], references: [addons.id] }),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  store: one(locations, { fields: [staff.storeId], references: [locations.id] }),
  staffServices: many(staffServices),
  availability: many(staffAvailability),
  staffSettings: one(staffSettings),
}));

export const staffAvailabilityRelations = relations(staffAvailability, ({ one }) => ({
  staff: one(staff, { fields: [staffAvailability.staffId], references: [staff.id] }),
}));

export const staffServicesRelations = relations(staffServices, ({ one }) => ({
  staff: one(staff, { fields: [staffServices.staffId], references: [staff.id] }),
  service: one(services, { fields: [staffServices.serviceId], references: [services.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  staff: one(staff, {
    fields: [appointments.staffId],
    references: [staff.id],
  }),
  customer: one(_clients, {
    fields: [appointments.customerId],
    references: [_clients.id],
  }),
  store: one(locations, {
    fields: [appointments.storeId],
    references: [locations.id],
  }),
  appointmentAddons: many(appointmentAddons),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
  store: one(locations, { fields: [permissions.storeId], references: [locations.id] }),
}));

export const rolesRelations = relations(roles, ({ one }) => ({
  store: one(locations, { fields: [roles.storeId], references: [locations.id] }),
}));

export const appsRelations = relations(apps, ({ one }) => ({
  store: one(locations, { fields: [apps.storeId], references: [locations.id] }),
}));

export const staffSettingsRelations = relations(staffSettings, ({ one }) => ({
  staff: one(staff, { fields: [staffSettings.staffId], references: [staff.id] }),
  store: one(locations, { fields: [staffSettings.storeId], references: [locations.id] }),
}));

export const storeSettingsRelations = relations(storeSettings, ({ one }) => ({
  store: one(locations, { fields: [storeSettings.storeId], references: [locations.id] }),
}));

export const googleBusinessProfilesRelations = relations(googleBusinessProfiles, ({ one, many }) => ({
  store: one(locations, { fields: [googleBusinessProfiles.storeId], references: [locations.id] }),
  reviews: many(googleReviews),
}));

export const googleBusinessAccountsRelations = relations(googleBusinessAccounts, ({ one, many }) => ({
  store: one(locations, { fields: [googleBusinessAccounts.storeId], references: [locations.id] }),
  locations: many(googleBusinessLocations),
  syncLogs: many(googleBusinessSyncLogs),
}));

export const googleBusinessLocationsRelations = relations(googleBusinessLocations, ({ one, many }) => ({
  store: one(locations, { fields: [googleBusinessLocations.storeId], references: [locations.id] }),
  businessAccount: one(googleBusinessAccounts, {
    fields: [googleBusinessLocations.businessAccountId],
    references: [googleBusinessAccounts.id],
  }),
  reviews: many(googleReviews),
  syncLogs: many(googleBusinessSyncLogs),
}));

export const googleBusinessSyncLogsRelations = relations(googleBusinessSyncLogs, ({ one }) => ({
  store: one(locations, { fields: [googleBusinessSyncLogs.storeId], references: [locations.id] }),
  location: one(googleBusinessLocations, {
    fields: [googleBusinessSyncLogs.locationId],
    references: [googleBusinessLocations.id],
  }),
}));

export const googleReviewsRelations = relations(googleReviews, ({ one, many }) => ({
  store: one(locations, { fields: [googleReviews.storeId], references: [locations.id] }),
  gbLocation: one(googleBusinessLocations, {
    fields: [googleReviews.gbLocationId],
    references: [googleBusinessLocations.id],
  }),
  appointment: one(appointments, {
    fields: [googleReviews.appointmentId],
    references: [appointments.id],
  }),
  customer: one(_clients, { fields: [googleReviews.customerId], references: [_clients.id] }),
  responses: many(googleReviewResponses),
}));

export const googleReviewResponsesRelations = relations(googleReviewResponses, ({ one }) => ({
  review: one(googleReviews, {
    fields: [googleReviewResponses.googleReviewId],
    references: [googleReviews.id],
  }),
  store: one(locations, { fields: [googleReviewResponses.storeId], references: [locations.id] }),
  staff: one(staff, { fields: [googleReviewResponses.staffId], references: [staff.id] }),
}));

// === SCHEMAS ===

export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({ id: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true });
export const insertServiceOptionSchema = createInsertSchema(serviceOptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAddonSchema = createInsertSchema(addons).omit({ id: true });
export const insertServiceAddonSchema = createInsertSchema(serviceAddons).omit({ id: true });
export const insertAppointmentAddonSchema = createInsertSchema(appointmentAddons).omit({ id: true });
export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true });
export const insertPackageItemSchema = createInsertSchema(packageItems).omit({ id: true });
export const insertStaffSchema = createInsertSchema(staff).omit({ id: true });
export const insertStaffServiceSchema = createInsertSchema(staffServices).omit({ id: true });
export const insertStaffAvailabilitySchema = createInsertSchema(staffAvailability).omit({ id: true });
export const insertCustomerSchema = z.object({
  name: z.string(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
  birthday: z.string().nullish(),
  allergies: z.string().nullish(),
  marketingOptIn: z.boolean().nullish(),
  loyaltyPoints: z.number().int().nullish(),
  storeId: z.number().int().nullish(),
});
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertBusinessHoursSchema = createInsertSchema(businessHours).omit({ id: true });
export const insertCalendarSettingsSchema = createInsertSchema(calendarSettings).omit({ id: true });
export const insertCashDrawerSessionSchema = createInsertSchema(cashDrawerSessions).omit({ id: true });
export const insertDrawerActionSchema = createInsertSchema(drawerActions).omit({ id: true });
export const insertBusinessDaySchema = createInsertSchema(businessDays).omit({ id: true, createdAt: true });
export const insertBusinessDayActionSchema = createInsertSchema(businessDayActions).omit({ id: true });
export const insertSmsSettingsSchema = createInsertSchema(smsSettings).omit({ id: true });
export const insertSmsLogSchema = createInsertSchema(smsLog).omit({ id: true });
export const insertMailSettingsSchema = createInsertSchema(mailSettings).omit({ id: true });

export const insertPermissionsSchema = createInsertSchema(permissions).omit({ id: true });
export const insertRolesSchema = createInsertSchema(roles).omit({ id: true });
export const insertAppsSchema = createInsertSchema(apps).omit({ id: true });
export const insertStaffSettingsSchema = createInsertSchema(staffSettings).omit({ id: true });
export const insertStoreSettingsSchema = createInsertSchema(storeSettings).omit({ id: true });
export const insertStaffPinSchema = createInsertSchema(staffPins).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeclockSchema = createInsertSchema(timeclock).omit({ id: true, createdAt: true });

export const insertGoogleBusinessProfileSchema = createInsertSchema(googleBusinessProfiles).omit({ id: true });
export const insertGoogleBusinessAccountSchema = createInsertSchema(googleBusinessAccounts).omit({ id: true });
export const insertGoogleBusinessLocationSchema = createInsertSchema(googleBusinessLocations).omit({ id: true });
export const insertGoogleBusinessSyncLogSchema = createInsertSchema(googleBusinessSyncLogs).omit({ id: true });
export const insertGoogleReviewSchema = createInsertSchema(googleReviews).omit({ id: true });
export const insertGoogleReviewResponseSchema = createInsertSchema(googleReviewResponses).omit({ id: true });
export const insertGoogleServiceSyncSettingsSchema = createInsertSchema(googleServiceSyncSettings).omit({ id: true });
export type GoogleServiceSyncSettings = typeof googleServiceSyncSettings.$inferSelect;
export type InsertGoogleServiceSyncSettings = typeof googleServiceSyncSettings.$inferInsert;

// === EXPLICIT API TYPES ===

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

// Backwards compatibility aliases
export type Store = Location;
export type InsertStore = InsertLocation;

export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type ServiceOption = typeof serviceOptions.$inferSelect;
export type InsertServiceOption = z.infer<typeof insertServiceOptionSchema>;
export type ServiceWithOptions = Service & { options: ServiceOption[] };

export type Addon = typeof addons.$inferSelect;
export type InsertAddon = z.infer<typeof insertAddonSchema>;

export type ServiceAddon = typeof serviceAddons.$inferSelect;
export type InsertServiceAddon = z.infer<typeof insertServiceAddonSchema>;

export type AppointmentAddon = typeof appointmentAddons.$inferSelect;
export type InsertAppointmentAddon = z.infer<typeof insertAppointmentAddonSchema>;

export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type PackageItem = typeof packageItems.$inferSelect;

/** One resolved component of a package, hydrated with name/price/duration. */
export interface PackageItemDetail {
  itemType: "service" | "addon";
  serviceId: number | null;
  addonId: number | null;
  name: string;
  price: number;
  duration: number;
}

/** A package plus its hydrated items and the three derived numbers. */
export type PackageWithItems = Package & {
  items: PackageItemDetail[];
  /** Σ component durations (minutes) — always the scheduling duration. */
  duration: number;
  /** Σ component prices. */
  listPrice: number;
  /** pricingMode === "fixed" ? Number(fixedPrice) : listPrice */
  price: number;
};

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

export type StaffService = typeof staffServices.$inferSelect;
export type InsertStaffService = z.infer<typeof insertStaffServiceSchema>;

export type StaffAvailability = typeof staffAvailability.$inferSelect;
export type InsertStaffAvailability = z.infer<typeof insertStaffAvailabilitySchema>;

export type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  birthday: string | null;
  allergies: string | null;
  marketingOptIn: boolean | null;
  loyaltyPoints: number | null;
  storeId: number | null;
};
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type AppointmentWithDetails = Appointment & {
  service: Service | null;
  staff: Staff | null;
  customer: Customer | null;
  store: Store | null;
  appointmentAddons?: Array<AppointmentAddon & { addon: Addon | null }>;
};

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type BusinessHours = typeof businessHours.$inferSelect;
export type InsertBusinessHours = z.infer<typeof insertBusinessHoursSchema>;

export type CalendarSettings = typeof calendarSettings.$inferSelect;
export type InsertCalendarSettings = z.infer<typeof insertCalendarSettingsSchema>;

export type CashDrawerSession = typeof cashDrawerSessions.$inferSelect;
export type InsertCashDrawerSession = z.infer<typeof insertCashDrawerSessionSchema>;

export type DrawerAction = typeof drawerActions.$inferSelect;
export type InsertDrawerAction = z.infer<typeof insertDrawerActionSchema>;

export type BusinessDay = typeof businessDays.$inferSelect;
export type InsertBusinessDay = z.infer<typeof insertBusinessDaySchema>;

export type BusinessDayAction = typeof businessDayActions.$inferSelect;
export type InsertBusinessDayAction = z.infer<typeof insertBusinessDayActionSchema>;

export type BusinessDayWithActions = BusinessDay & { actions: BusinessDayAction[] };

export type SmsSettings = typeof smsSettings.$inferSelect;
export type InsertSmsSettings = z.infer<typeof insertSmsSettingsSchema>;

export type SmsLogEntry = typeof smsLog.$inferSelect;
export type InsertSmsLog = z.infer<typeof insertSmsLogSchema>;

export type MailSettings = typeof mailSettings.$inferSelect;
export type InsertMailSettings = z.infer<typeof insertMailSettingsSchema>;


export type Permissions = typeof permissions.$inferSelect;
export type InsertPermissions = z.infer<typeof insertPermissionsSchema>;

export type Roles = typeof roles.$inferSelect;
export type InsertRoles = z.infer<typeof insertRolesSchema>;

export type Apps = typeof apps.$inferSelect;
export type InsertApps = z.infer<typeof insertAppsSchema>;

export type StaffSettings = typeof staffSettings.$inferSelect;
export type InsertStaffSettings = z.infer<typeof insertStaffSettingsSchema>;

export type StoreSettings = typeof storeSettings.$inferSelect;
export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;

export type GoogleBusinessProfile = typeof googleBusinessProfiles.$inferSelect;
export type InsertGoogleBusinessProfile = z.infer<typeof insertGoogleBusinessProfileSchema>;

export type GoogleBusinessAccount = typeof googleBusinessAccounts.$inferSelect;
export type InsertGoogleBusinessAccount = z.infer<typeof insertGoogleBusinessAccountSchema>;

export type GoogleBusinessLocation = typeof googleBusinessLocations.$inferSelect;
export type InsertGoogleBusinessLocation = z.infer<typeof insertGoogleBusinessLocationSchema>;

export type GoogleBusinessSyncLog = typeof googleBusinessSyncLogs.$inferSelect;
export type InsertGoogleBusinessSyncLog = z.infer<typeof insertGoogleBusinessSyncLogSchema>;

export type GoogleReview = typeof googleReviews.$inferSelect;
export type InsertGoogleReview = z.infer<typeof insertGoogleReviewSchema>;

export type GoogleReviewResponse = typeof googleReviewResponses.$inferSelect;
export type InsertGoogleReviewResponse = z.infer<typeof insertGoogleReviewResponseSchema>;

export type StaffPin = typeof staffPins.$inferSelect;
export type InsertStaffPin = z.infer<typeof insertStaffPinSchema>;

export type Timeclock = typeof timeclock.$inferSelect;
export type InsertTimeclock = z.infer<typeof insertTimeclockSchema>;

// === PAYROLL RUNS (commission-only contractor payroll) ===

export const payrollRuns = pgTable("payroll_runs", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  periodStart:      text("period_start").notNull(),
  periodEnd:        text("period_end").notNull(),
  status:           text("status").notNull().default("draft"),
  totalCommission:  decimal("total_commission", { precision: 10, scale: 2 }).notNull().default("0"),
  contractorCount:  integer("contractor_count").notNull().default(0),
  notes:            text("notes"),
  createdBy:        text("created_by"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  finalizedAt:      timestamp("finalized_at"),
}, (t) => ({
  storeCreatedIdx: index("pr_store_created_idx").on(t.storeId, t.createdAt),
  storeStatusIdx:  index("pr_store_status_idx").on(t.storeId, t.status),
}));

export const payrollRunItems = pgTable("payroll_run_items", {
  id:               serial("id").primaryKey(),
  payrollRunId:     integer("payroll_run_id").references(() => payrollRuns.id, { onDelete: "cascade" }).notNull(),
  staffId:          integer("staff_id").references(() => staff.id, { onDelete: "cascade" }).notNull(),
  staffName:        text("staff_name").notNull().default(""),
  commissionRate:   decimal("commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  appointmentCount: integer("appointment_count").notNull().default(0),
  serviceRevenue:   decimal("service_revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  addonRevenue:     decimal("addon_revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  totalRevenue:     decimal("total_revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status:           text("status").notNull().default("pending"),
  notes:            text("notes"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  runIdx: index("pri_run_idx").on(t.payrollRunId),
}));

export const insertPayrollRunSchema     = createInsertSchema(payrollRuns).omit({ id: true, createdAt: true });
export const insertPayrollRunItemSchema = createInsertSchema(payrollRunItems).omit({ id: true, createdAt: true });

export type PayrollRun      = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRunItem  = typeof payrollRunItems.$inferSelect;
export type InsertPayrollRunItem = z.infer<typeof insertPayrollRunItemSchema>;

export type PayrollRunWithItems = PayrollRun & { items: PayrollRunItem[] };

export type CashDrawerSessionWithActions = CashDrawerSession & {
  actions: DrawerAction[];
};

// === REVIEWS TABLE ===

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  customerId: integer("customer_id").references(() => _clients.id),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  staffId: integer("staff_id").references(() => staff.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  customerName: text("customer_name"),
  serviceName: text("service_name"),
  staffName: text("staff_name"),
  photoUrl: text("photo_url"),
  isPublic: boolean("is_public").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CERTXA PRO — FIELD SERVICE TABLES ===

export const crews = pgTable("pro_crews", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#00D4AA"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  phone: text("phone"),
  pinHash: text("pin_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const crewLocations = pgTable("pro_crew_locations", {
  id: serial("id").primaryKey(),
  crewId: integer("crew_id").references(() => crews.id).notNull(),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceOrders = pgTable("pro_service_orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("new"),
  priority: text("priority").notNull().default("normal"),
  serviceType: text("service_type").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lng: decimal("lng", { precision: 10, scale: 7 }),
  description: text("description"),
  crewId: integer("crew_id").references(() => crews.id),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedHours: decimal("estimated_hours", { precision: 4, scale: 1 }),
  overtimeFlagged: boolean("overtime_flagged").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orderNotes = pgTable("pro_order_notes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => serviceOrders.id).notNull(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  note: text("note").notNull(),
  authorName: text("author_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proCustomers = pgTable("pro_customers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  propertyType: text("property_type").default("residential"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proEstimates = pgTable("pro_estimates", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  estimateNumber: text("estimate_number").notNull(),
  status: text("status").notNull().default("draft"),
  customerId: integer("customer_id").references(() => proCustomers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  serviceType: text("service_type"),
  description: text("description"),
  lineItems: text("line_items"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  convertedToOrderId: integer("converted_to_order_id"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const proInvoices = pgTable("pro_invoices", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  orderId: integer("order_id").references(() => serviceOrders.id),
  invoiceNumber: text("invoice_number").notNull(),
  status: text("status").notNull().default("draft"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  address: text("address"),
  lineItems: text("line_items"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).default("0"),
  paidAt: timestamp("paid_at"),
  dueAt: timestamp("due_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCrewSchema = createInsertSchema(crews).omit({ id: true, createdAt: true });
export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderNoteSchema = createInsertSchema(orderNotes).omit({ id: true, createdAt: true });

export const insertProCustomerSchema = createInsertSchema(proCustomers).omit({ id: true, createdAt: true });
export const insertProEstimateSchema = createInsertSchema(proEstimates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProInvoiceSchema = createInsertSchema(proInvoices).omit({ id: true, createdAt: true, updatedAt: true });

export type Crew = typeof crews.$inferSelect;
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;
export type OrderNote = typeof orderNotes.$inferSelect;
export type InsertOrderNote = z.infer<typeof insertOrderNoteSchema>;
export type CrewLocation = typeof crewLocations.$inferSelect;
export type ProCustomer = typeof proCustomers.$inferSelect;
export type InsertProCustomer = z.infer<typeof insertProCustomerSchema>;
export type ProEstimate = typeof proEstimates.$inferSelect;
export type InsertProEstimate = z.infer<typeof insertProEstimateSchema>;
export type ProInvoice = typeof proInvoices.$inferSelect;
export type InsertProInvoice = z.infer<typeof insertProInvoiceSchema>;

// === NEW FEATURE SCHEMAS ===

export const insertWaitlistSchema = createInsertSchema(waitlist).omit({ id: true });
export const insertGiftCardSchema = createInsertSchema(giftCards).omit({ id: true });
export const insertGiftCardTransactionSchema = createInsertSchema(giftCardTransactions).omit({ id: true });
export const insertIntakeFormSchema = createInsertSchema(intakeForms).omit({ id: true });
export const insertIntakeFormFieldSchema = createInsertSchema(intakeFormFields).omit({ id: true });
export const insertIntakeFormResponseSchema = createInsertSchema(intakeFormResponses).omit({ id: true });
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true });

export type WaitlistEntry = typeof waitlist.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistSchema>;

export type GiftCard = typeof giftCards.$inferSelect;
export type InsertGiftCard = z.infer<typeof insertGiftCardSchema>;

export type GiftCardTransaction = typeof giftCardTransactions.$inferSelect;
export type InsertGiftCardTransaction = z.infer<typeof insertGiftCardTransactionSchema>;

export type IntakeForm = typeof intakeForms.$inferSelect;
export type InsertIntakeForm = z.infer<typeof insertIntakeFormSchema>;

export type IntakeFormField = typeof intakeFormFields.$inferSelect;
export type InsertIntakeFormField = z.infer<typeof insertIntakeFormFieldSchema>;

export type IntakeFormResponse = typeof intakeFormResponses.$inferSelect;
export type InsertIntakeFormResponse = z.infer<typeof insertIntakeFormResponseSchema>;

export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;

export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

export const names = pgTable("names", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  origin: varchar("origin", { length: 32 }).notNull(),
  gender: varchar("gender", { length: 16 }).notNull().default("female"),
}, (t) => [
  index("idx_names_origin").on(t.origin),
  uniqueIndex("idx_names_name_origin_unique").on(t.name, t.origin),
]);

export type Name = typeof names.$inferSelect;
export type InsertName = typeof names.$inferInsert;

// === LAUNCHSITE TABLES (PHP/marketing site) ===

export const onboardingSubmissions = pgTable("onboarding_submissions", {
  id: serial("id").primaryKey(),
  // Legacy column — kept for backward compat; new rows use contact_email
  email: text("email"),
  contactEmail: text("contact_email"),
  businessName: text("business_name"),
  templateId: text("template_id"),
  phone: text("phone"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  countyState: text("county_state"),
  postcode: text("postcode"),
  country: text("country").default("GB"),
  hours: jsonb("hours"),
  bookingEnabled: boolean("booking_enabled").default(false),
  domainType: text("domain_type").default("subdomain"), // 'subdomain' | 'custom'
  subdomain: text("subdomain"),
  customDomain: text("custom_domain"),
  domainPaymentStatus: text("domain_payment_status").default("n/a"),
  heroImage: text("hero_image"),
  plan: text("plan").default("free"),
  poweredByCertxa: boolean("powered_by_certxa").default(true),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const subdomains = pgTable("subdomains", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").references(() => onboardingSubmissions.id),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OnboardingSubmission = typeof onboardingSubmissions.$inferSelect;
export type InsertOnboardingSubmission = typeof onboardingSubmissions.$inferInsert;
export type Subdomain = typeof subdomains.$inferSelect;
export type InsertSubdomain = typeof subdomains.$inferInsert;

// ─── Two-Way SMS Inbox ────────────────────────────────────────────────────────

export const smsConversations = pgTable("sms_conversations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  clientPhone: text("client_phone").notNull(),
  clientName: text("client_name"),
  direction: text("direction").notNull(), // "inbound" | "outbound"
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sms_conv_store_phone_idx").on(t.storeId, t.clientPhone),
  index("sms_conv_store_created_idx").on(t.storeId, t.createdAt),
]);

export type SmsConversation = typeof smsConversations.$inferSelect;
export type InsertSmsConversation = typeof smsConversations.$inferInsert;

// ─── SMS Contact Routing Table ────────────────────────────────────────────────
// Maps a client phone number to the salon that last interacted with them.
// Used by the shared toll-free number to route inbound SMS to the correct store.

export const smsContactRouting = pgTable("sms_contact_routing", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  clientPhone: text("client_phone").notNull(), // E.164 format: +1XXXXXXXXXX
  lastOutboundAt: timestamp("last_outbound_at"),
  lastInboundAt: timestamp("last_inbound_at"),
  lastInteractionAt: timestamp("last_interaction_at").notNull(),
  archivedAt: timestamp("archived_at"),  // non-null = archived (hidden from inbox)
  blockedAt: timestamp("blocked_at"),    // non-null = blocked (no inbound saved, reply disabled)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("sms_routing_store_phone_uq").on(t.storeId, t.clientPhone),
  index("sms_routing_phone_idx").on(t.clientPhone),
  index("sms_routing_interaction_idx").on(t.clientPhone, t.lastInteractionAt),
]);

export type SmsContactRouting = typeof smsContactRouting.$inferSelect;
export type InsertSmsContactRouting = typeof smsContactRouting.$inferInsert;

// ── Revenue Intelligence Engine ──────────────────────────────────────────────
export {
  clientIntelligence,
  staffIntelligence,
  intelligenceInterventions,
  growthScoreSnapshots,
  deadSeatPatterns,
} from "./schema/intelligence";
export type {
  ClientIntelligence,
  StaffIntelligence,
  IntelligenceIntervention,
  GrowthScoreSnapshot,
  DeadSeatPattern,
} from "./schema/intelligence";

// ── LaunchSite Template Catalog ───────────────────────────────────────────────
export const launchsiteTemplates = pgTable("launchsite_templates", {
  id:           text("id").primaryKey(),
  name:         text("name").notNull(),
  category:     text("category").notNull(),
  style:        text("style").notNull().default("Modern"),
  desc:         text("desc").notNull().default(""),
  badge:        text("badge").notNull().default(""),
  features:     jsonb("features").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  accent:       text("accent").notNull().default("#a855f7"),
  dark:         text("dark").notNull().default("#0a0b15"),
  light:        text("light").notNull().default("#1c1d27"),
  urlSlug:      text("url_slug").notNull(),
  heroTagline:  text("hero_tagline").notNull().default(""),
  heroSub:      text("hero_sub").notNull().default(""),
  businessName: text("business_name").notNull().default(""),
  type:         text("type").notNull().default("php"),
  reactPath:    text("react_path"),
  scrapedPath:  text("scraped_path"),
  sourceUrl:    text("source_url"),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export type LaunchsiteTemplate = typeof launchsiteTemplates.$inferSelect;
export type InsertLaunchsiteTemplate = typeof launchsiteTemplates.$inferInsert;

// ── Turn Assignment Log ───────────────────────────────────────────────────────
// Every walk-in assignment is recorded here so management can spot patterns
// of favoritism (e.g. a front-desk user consistently routing walk-ins to the
// same technician instead of following the Turn queue).
export const turnAssignmentLog = pgTable("turn_assignment_log", {
  id:                     serial("id").primaryKey(),
  storeId:                integer("store_id").notNull(),
  bookedByUserId:         integer("booked_by_user_id"),
  appointmentId:          integer("appointment_id"),
  assignedStaffId:        integer("assigned_staff_id").notNull(),
  turnRecommendedStaffId: integer("turn_recommended_staff_id"), // who Turn said was #1 at booking time
  isOverride:             boolean("is_override").notNull().default(false), // true = bypassed Turn queue
  // 'turn_system'       – normal Turn-assigned walk-in (Consideration Lock applied)
  // 'calendar_override' – front desk clicked a specific tech's slot instead of using Walk-In
  // 'walkin_fallback'   – walk-in with no Turn-eligible staff, fell back to any available slot
  source:                 text("source").notNull().default("turn_system"),
  createdAt:              timestamp("created_at").defaultNow().notNull(),
});

export type TurnAssignmentLog = typeof turnAssignmentLog.$inferSelect;
export type InsertTurnAssignmentLog = typeof turnAssignmentLog.$inferInsert;

// ── Store Activity Feed ────────────────────────────────────────────────────────
// One row per notable real-time event for the owner-facing "Owner Feed" widget
// on the salon dashboard (check-ins, completions, payments, AI bookings, etc.)
export const storeActivityEvents = pgTable("store_activity_events", {
  id:         serial("id").primaryKey(),
  storeId:    integer("store_id").notNull(),
  // 'check_in' | 'service_completed' | 'payment' | 'ai_booking' | 'walk_in' |
  // 'vip_arrival' | 'review' | 'new_booking'
  eventType:  text("event_type").notNull(),
  message:    text("message").notNull(),
  amount:     decimal("amount", { precision: 10, scale: 2 }),
  metadata:   jsonb("metadata"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export type StoreActivityEvent = typeof storeActivityEvents.$inferSelect;
export type InsertStoreActivityEvent = typeof storeActivityEvents.$inferInsert;

// ── AI Receptionist Call Log ──────────────────────────────────────────────────
// One row per inbound call handled by the AI receptionist.
// outcome values: 'in_progress' | 'booked' | 'cancelled' | 'rescheduled' | 'inquiry' | 'no_action' | 'error'
export interface CallTranscriptTurn {
  role: "caller" | "autumn";
  text: string;
  ts: string; // ISO timestamp
}

export const aiCallLog = pgTable("ai_call_log", {
  id:              serial("id").primaryKey(),
  storeId:         integer("store_id").references(() => locations.id).notNull(),
  callSid:         text("call_sid"),
  recordingSid:    text("recording_sid"),
  recordingUrl:    text("recording_url"),
  callerPhone:     text("caller_phone"),
  callerName:      text("caller_name"),
  outcome:         text("outcome").notNull().default("in_progress"),
  appointmentId:   integer("appointment_id").references(() => appointments.id),
  durationSeconds: integer("duration_seconds"),
  startedAt:       timestamp("started_at").defaultNow().notNull(),
  endedAt:         timestamp("ended_at"),
  notes:           text("notes"),
  transcript:      jsonb("transcript").$type<CallTranscriptTurn[]>(),
});

export type AiCallLog = typeof aiCallLog.$inferSelect;
export type InsertAiCallLog = typeof aiCallLog.$inferInsert;

// ─── AI Usage Metering ────────────────────────────────────────────────────────

/** Per-call usage + cost record, written when the call ends. */
export const callUsageRecords = pgTable("call_usage_records", {
  id:               serial("id").primaryKey(),
  callLogId:        integer("call_log_id").references(() => aiCallLog.id),
  storeId:          integer("store_id").references(() => locations.id).notNull(),
  callSid:          text("call_sid"),
  durationSeconds:  integer("duration_seconds").notNull().default(0),
  audioTokensIn:    integer("audio_tokens_in").notNull().default(0),
  audioTokensOut:   integer("audio_tokens_out").notNull().default(0),
  textTokensIn:     integer("text_tokens_in").notNull().default(0),
  textTokensOut:    integer("text_tokens_out").notNull().default(0),
  inputTokens:      integer("input_tokens").notNull().default(0),
  outputTokens:     integer("output_tokens").notNull().default(0),
  totalTokens:      integer("total_tokens").notNull().default(0),
  cachedTokens:     integer("cached_tokens").notNull().default(0),
  rawUsage:         jsonb("raw_usage"),
  toolCallCount:    integer("tool_call_count").notNull().default(0),
  aiResponseCount:  integer("ai_response_count").notNull().default(0),
  twilioMinutes:    decimal("twilio_minutes",  { precision: 10, scale: 4 }).notNull().default("0"),
  twilioEstCost:    decimal("twilio_est_cost",  { precision: 10, scale: 6 }).notNull().default("0"),
  openaiEstCost:    decimal("openai_est_cost",  { precision: 10, scale: 6 }).notNull().default("0"),
  totalEstCost:     decimal("total_est_cost",   { precision: 10, scale: 6 }).notNull().default("0"),
  terminationReason: text("termination_reason"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

/** Per-salon configurable cost/usage limits. */
export const salonUsageLimits = pgTable("salon_usage_limits", {
  storeId:             integer("store_id").references(() => locations.id).primaryKey(),
  maxCallDurationMin:  integer("max_call_duration_min").notNull().default(12),
  maxDailyMinutes:     integer("max_daily_minutes").notNull().default(480),
  maxMonthlyCostUsd:   decimal("max_monthly_cost_usd", { precision: 10, scale: 2 }).notNull().default("200"),
  maxConcurrentCalls:  integer("max_concurrent_calls").notNull().default(3),
  idleTimeoutSeconds:  integer("idle_timeout_seconds").notNull().default(30),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
});

export type CallUsageRecord   = typeof callUsageRecords.$inferSelect;
export type InsertCallUsage   = typeof callUsageRecords.$inferInsert;
export type SalonUsageLimits  = typeof salonUsageLimits.$inferSelect;

// ─── AI Silence Incidents (L9 — Reliability Hardening) ───────────────────────

/** One row per silence/stall event detected during a live call. */
export const aiSilenceIncidents = pgTable("ai_silence_incidents", {
  id:                serial("id").primaryKey(),
  callLogId:         integer("call_log_id").references(() => aiCallLog.id),
  storeId:           integer("store_id").references(() => locations.id).notNull(),
  callSid:           text("call_sid"),
  layer:             text("layer").notNull(),
  silenceDurationMs: integer("silence_duration_ms").notNull(),
  recoveryAction:    text("recovery_action").notNull(),
  occurredAt:        timestamp("occurred_at").defaultNow().notNull(),
});

export type AiSilenceIncident       = typeof aiSilenceIncidents.$inferSelect;
export type InsertAiSilenceIncident = typeof aiSilenceIncidents.$inferInsert;

// ─── Autumn Demo Callers ──────────────────────────────────────────────────────

/** Phone numbers submitted via the "Try Free Demo" CTA on the /autumn page.
 *  The AI receptionist demo account only accepts calls from numbers stored here. */
export const autumnDemoCallers = pgTable("autumn_demo_callers", {
  id:        serial("id").primaryKey(),
  phone:     text("phone").notNull(),
  ip:        text("ip"),
  status:    text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AutumnDemoCaller       = typeof autumnDemoCallers.$inferSelect;
export type InsertAutumnDemoCaller = typeof autumnDemoCallers.$inferInsert;

// ─── Platform Credit Transactions ─────────────────────────────────────────────
// Immutable ledger — every change to platform_credits is recorded here.
// amount is positive for additions (topup, adjustment) and negative for deductions.
export const platformCreditTransactions = pgTable("platform_credit_transactions", {
  id:            serial("id").primaryKey(),
  storeId:       integer("store_id").notNull().references(() => locations.id),
  type:          text("type").notNull(), // 'topup' | 'ai_provision' | 'ai_call' | 'sms' | 'adjustment'
  amount:        decimal("amount",       { precision: 10, scale: 2 }).notNull(),
  description:   text("description").notNull(),
  balanceAfter:  decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  referenceId:   text("reference_id"),   // Stripe session ID, call log ID, etc.
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export type PlatformCreditTransaction       = typeof platformCreditTransactions.$inferSelect;
export type InsertPlatformCreditTransaction = typeof platformCreditTransactions.$inferInsert;

// ─── User Email Preferences ────────────────────────────────────────────────────
// Per-user opt-in/opt-out for non-critical system emails from Certxa.
// Critical emails (payment failed, account suspended/locked) are always sent.
export const userEmailPreferences = pgTable("user_email_preferences", {
  id:               serial("id").primaryKey(),
  userId:           text("user_id").notNull().unique(),
  billingReceipts:  boolean("billing_receipts").notNull().default(true),
  lowBalanceAlerts: boolean("low_balance_alerts").notNull().default(true),
  dataOperations:   boolean("data_operations").notNull().default(true),
  trialReminders:   boolean("trial_reminders").notNull().default(true),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
});

export type UserEmailPreferences       = typeof userEmailPreferences.$inferSelect;
export type InsertUserEmailPreferences = typeof userEmailPreferences.$inferInsert;

// ─── Wallet Transactions ───────────────────────────────────────────────────────
// Immutable ledger for account funding via Stripe. Balance = SUM of completed txns.
// transaction_type: 'deposit' | 'usage' | 'refund' | 'adjustment'
// status:           'pending' | 'completed' | 'failed'
export const walletTransactions = pgTable("wallet_transactions", {
  id:                  serial("id").primaryKey(),
  storeId:             integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  stripePaymentIntent: text("stripe_payment_intent"),
  amount:              integer("amount").notNull(),
  transactionType:     text("transaction_type").notNull().default("deposit"),
  status:              text("status").notNull().default("pending"),
  description:         text("description"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_wallet_transactions_store_id").on(t.storeId),
  index("idx_wallet_transactions_status").on(t.status),
  index("idx_wallet_transactions_store_status").on(t.storeId, t.status),
]);

export type WalletTransaction       = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;

// ─── Webhook Events (idempotency guard) ───────────────────────────────────────
export const webhookEvents = pgTable("webhook_events", {
  id:          serial("id").primaryKey(),
  eventId:     text("event_id").notNull().unique(),
  eventType:   text("event_type").notNull(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
}, (t) => [
  index("idx_webhook_events_event_id").on(t.eventId),
]);

export type WebhookEvent       = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

// ─── Store Invoices (Stripe invoice mirror) ───────────────────────────────────
export const storeInvoices = pgTable("store_invoices", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  stripeInvoiceId:  text("stripe_invoice_id").notNull().unique(),
  invoiceNumber:    text("invoice_number"),
  status:           text("status"),
  paid:             boolean("paid").notNull().default(false),
  totalCents:       integer("total_cents").notNull().default(0),
  amountPaidCents:  integer("amount_paid_cents").notNull().default(0),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  invoicePdfUrl:    text("invoice_pdf_url"),
  billingReason:    text("billing_reason"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("idx_store_invoices_store_id").on(t.storeId),
  index("idx_store_invoices_paid").on(t.paid),
]);

export type StoreInvoice       = typeof storeInvoices.$inferSelect;
export type InsertStoreInvoice = typeof storeInvoices.$inferInsert;

// ─── Support Tickets ──────────────────────────────────────────────────────────
// Created by the Certxa Support Agent when a caller's issue cannot be resolved.
export const supportTickets = pgTable("support_tickets", {
  id:                 serial("id").primaryKey(),
  // ── Voice-agent origin columns (kept for backward compat) ─────────────────
  name:               text("name"),
  businessName:       text("business_name"),
  phone:              text("phone"),
  email:              text("email"),
  issue:              text("issue"),                             // was NOT NULL — dropped by back-office migration
  callSid:            text("call_sid"),
  callLogId:          integer("call_log_id"),
  resolvedAt:         timestamp("resolved_at"),
  resolvedBy:         text("resolved_by"),
  internalNotes:      text("internal_notes"),
  // ── Back-office columns ───────────────────────────────────────────────────
  accountId:          integer("account_id"),
  ticketNumber:       varchar("ticket_number", { length: 32 }),
  subject:            text("subject"),
  description:        text("description"),
  assignedAgentId:    integer("assigned_agent_id"),
  assignedAgentName:  varchar("assigned_agent_name", { length: 128 }),
  createdByAgentId:   integer("created_by_agent_id"),
  customerEmail:      text("customer_email"),
  customerName:       text("customer_name"),
  ipAddress:          text("ip_address"),
  imapMessageId:      text("imap_message_id"),
  imapThreadId:       text("imap_thread_id"),
  accountName:        text("account_name"),
  category:           text("category"),
  subcategory:        text("subcategory"),
  channel:            text("channel"),
  firstResponseAt:    timestamp("first_response_at"),
  lastResponseAt:     timestamp("last_response_at"),
  closedAt:           timestamp("closed_at"),
  tags:               jsonb("tags"),
  // ── Shared ────────────────────────────────────────────────────────────────
  status:             text("status").notNull().default("open"),  // open | in_progress | resolved | closed
  priority:           text("priority").notNull().default("normal"), // normal | high | urgent
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("idx_support_tickets_status").on(t.status),
  index("idx_support_tickets_priority").on(t.priority),
  index("idx_support_tickets_created_at").on(t.createdAt),
]);

export type SupportTicket       = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// ─── Support Ticket Messages ──────────────────────────────────────────────────
export const supportTicketMessages = pgTable("support_ticket_messages", {
  id:          serial("id").primaryKey(),
  ticketId:    integer("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  authorType:  varchar("author_type", { length: 16 }).notNull().default("user"),
  authorName:  varchar("author_name", { length: 128 }),
  agentId:     integer("agent_id"),
  content:     text("content").notNull(),
  isInternal:  boolean("is_internal").notNull().default(false),
  direction:   text("direction"),                               // 'inbound' | 'outbound' | null (internal)
  rawHeaders:  text("raw_headers"),                            // raw email headers for IMAP messages
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export type SupportTicketMessage       = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessages.$inferInsert;

// ─── Support Agents ───────────────────────────────────────────────────────────
// Back-office support team members who handle tickets and incidents.
export const supportAgents = pgTable("support_agents", {
  id:          serial("id").primaryKey(),
  name:        text("name"),             // nullable — canonical fields are first_name + last_name; existing VPS rows may have name=NULL
  email:       text("email"),            // login email — auto-generated as {name}{id}@certxa.com
  personalEmail: text("personal_email"), // agent's real-world email — where credentials are sent
  role:        varchar("role", { length: 32 }).notNull().default("agent"),
  isActive:    boolean("is_active").notNull().default(true),
  passwordHash: text("password_hash"),
  firstName:   text("first_name"),
  lastName:    text("last_name"),
  avatarUrl:   text("avatar_url"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export type SupportAgent       = typeof supportAgents.$inferSelect;
export type InsertSupportAgent = typeof supportAgents.$inferInsert;

// ─── Support Incidents ────────────────────────────────────────────────────────
// Platform-level incidents (SEV-1 / SEV-2 outages etc.) tracked by the back-office.
export const supportIncidents = pgTable("support_incidents", {
  id:               serial("id").primaryKey(),
  title:            text("title").notNull(),
  description:      text("description"),
  severity:         text("severity").notNull().default("SEV-3"),
  status:           text("status").notNull().default("investigating"),
  affectedAccounts: integer("affected_accounts").default(0),
  ownerId:          integer("owner_id"),
  ownerName:        text("owner_name"),
  services:         text("services").array().default([]),
  rootCause:        text("root_cause"),
  resolvedAt:       timestamp("resolved_at"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
});

export type SupportIncident       = typeof supportIncidents.$inferSelect;
export type InsertSupportIncident = typeof supportIncidents.$inferInsert;

// ─── Support Incident Tasks ───────────────────────────────────────────────────
export const supportIncidentTasks = pgTable("support_incident_tasks", {
  id:             serial("id").primaryKey(),
  incidentId:     integer("incident_id").notNull(),
  title:          text("title").notNull(),
  assignedToId:   integer("assigned_to_id"),
  assignedToName: text("assigned_to_name"),
  status:         text("status").default("open"),
  createdAt:      timestamp("created_at").defaultNow(),
});

export type SupportIncidentTask       = typeof supportIncidentTasks.$inferSelect;
export type InsertSupportIncidentTask = typeof supportIncidentTasks.$inferInsert;

// ─── Support Incident Updates ─────────────────────────────────────────────────
export const supportIncidentUpdates = pgTable("support_incident_updates", {
  id:         serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull(),
  content:    text("content").notNull(),
  status:     text("status"),
  authorId:   integer("author_id"),
  authorName: text("author_name"),
  isPublic:   boolean("is_public").default(false),
  createdAt:  timestamp("created_at").defaultNow(),
});

export type SupportIncidentUpdate       = typeof supportIncidentUpdates.$inferSelect;
export type InsertSupportIncidentUpdate = typeof supportIncidentUpdates.$inferInsert;

// ─── Support Call Logs ────────────────────────────────────────────────────────
// One row per inbound call handled by the Certxa Support Agent.
export const supportCallLogs = pgTable("support_call_logs", {
  id:              serial("id").primaryKey(),
  callSid:         text("call_sid"),
  callerPhone:     text("caller_phone"),
  callerName:      text("caller_name"),
  businessName:    text("business_name"),
  accountStoreId:  integer("account_store_id"),  // resolved from caller's phone
  subscriptionPlan: text("subscription_plan"),
  outcome:         text("outcome").notNull().default("in_progress"), // resolved | escalated | ticket_created | no_action
  ticketId:        integer("ticket_id"),          // FK to support_tickets if one was created
  durationSeconds: integer("duration_seconds"),
  summary:         text("summary"),              // post-call AI-generated summary
  escalated:       boolean("escalated").notNull().default(false),
  priority:        text("priority").notNull().default("normal"),
  transcript:      jsonb("transcript"),
  startedAt:       timestamp("started_at").defaultNow().notNull(),
  endedAt:         timestamp("ended_at"),
}, (t) => [
  index("idx_support_call_logs_caller_phone").on(t.callerPhone),
  index("idx_support_call_logs_started_at").on(t.startedAt),
  index("idx_support_call_logs_outcome").on(t.outcome),
]);

export type SupportCallLog       = typeof supportCallLogs.$inferSelect;
export type InsertSupportCallLog = typeof supportCallLogs.$inferInsert;

// ─── Support Account Codes ───────────────────────────────────────────────────
// Maps a support verification code to a store/account context used by support tools.
export const supportAccountCodes = pgTable("support_account_codes", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  code:             varchar("code", { length: 32 }).notNull(),
  businessName:     text("business_name"),
  supportPhone:     text("support_phone"),
  ownerUserId:      text("owner_user_id"),
  usedAt:           timestamp("used_at"),
  lastCallSid:      text("last_call_sid"),
  lastCallerPhone:  text("last_caller_phone"),
  lastCallerName:   text("last_caller_name"),
  lastIssueSummary: text("last_issue_summary"),
  lastTranscript:   text("last_transcript"),
  lastTicketId:     integer("last_ticket_id"),
  lastSeenAt:       timestamp("last_seen_at"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("support_account_codes_code_unique").on(t.code),
  index("idx_support_account_codes_store_id").on(t.storeId),
]);

export type SupportAccountCode = typeof supportAccountCodes.$inferSelect;
export type InsertSupportAccountCode = typeof supportAccountCodes.$inferInsert;

// ─── Legacy Billing Tables (kept for compatibility with existing production DB) ─
// These are still read by API routes and must remain in Drizzle schema so db:push
// does not attempt destructive drops.
export const billingPlans = pgTable("billing_plans", {
  id:          serial("id").primaryKey(),
  code:        text("code").notNull().unique(),
  name:        text("name").notNull(),
  description: text("description"),
  priceCents:  integer("price_cents").notNull().default(0),
  interval:    text("interval").notNull().default("month"),
  currency:    text("currency").notNull().default("usd"),
  active:      boolean("active").notNull().default(true),
  featuresJson: jsonb("features_json"),
  stripePriceId:        text("stripe_price_id"),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly:  text("stripe_price_id_yearly"),
  contactsMin: decimal("contacts_min"),
  contactsMax: decimal("contacts_max"),
  smsCredits:  decimal("sms_credits"),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id:                  serial("id").primaryKey(),
  storeNumber:         integer("store_number").notNull().references(() => locations.id),
  planCode:            text("plan_code").notNull().references(() => billingPlans.code),
  stripeCustomerId:    text("stripe_customer_id"),
  stripeSubscriptionId:text("stripe_subscription_id"),
  status:              text("status"),
  currentPeriodEnd:    text("current_period_end"),
  createdAt:           timestamp("created_at").defaultNow(),
  interval:            text("interval").default("month"),
  priceId:             text("price_id"),
  cancelAtPeriodEnd:   integer("cancel_at_period_end").default(0),
  paymentMethodBrand:  text("payment_method_brand"),
  paymentMethodLast4:  text("payment_method_last4"),
  updatedAt:           timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_subscriptions_store_number").on(t.storeNumber),
  index("idx_subscriptions_stripe_subscription_id").on(t.stripeSubscriptionId),
]);

export type BillingPlan = typeof billingPlans.$inferSelect;
export type InsertBillingPlan = typeof billingPlans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── Kiosk Check-In System ────────────────────────────────────────────────────
// These tables are created at API startup and must be declared here so
// drizzle-kit push does not treat them as orphans and attempt to drop them.

export const kioskCheckins = pgTable("kiosk_checkins", {
  id:                serial("id").primaryKey(),
  storeId:           integer("store_id").notNull(),
  clientId:          integer("client_id"),
  phone:             text("phone"),
  clientName:        text("client_name"),
  services:          jsonb("services").default([]),
  token:             text("token").notNull().unique(),
  appointmentId:     integer("appointment_id"),
  status:            text("status").default("waiting"),
  createdAt:         timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt:         timestamp("expires_at", { withTimezone: true }),
  staffId:           integer("staff_id"),
  assignedStaffName: text("assigned_staff_name"),
});

export type KioskCheckin = typeof kioskCheckins.$inferSelect;
export type InsertKioskCheckin = typeof kioskCheckins.$inferInsert;

// ─── Service Illustration Categories ─────────────────────────────────────────
// Global library of illustration categories, managed by Certxa admins.
// Each category has an image (stored in R2) and belongs to an industry.

export const serviceIllustrationCategories = pgTable("service_illustration_categories", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  imageUrl:    text("image_url"),
  industry:    text("industry").notNull().default("NAIL_SALON"),
  isActive:    boolean("is_active").default(true),
  sortOrder:   integer("sort_order").default(0),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});

export type ServiceIllustrationCategory = typeof serviceIllustrationCategories.$inferSelect;
export type InsertServiceIllustrationCategory = typeof serviceIllustrationCategories.$inferInsert;

// ─── Service Images Library ───────────────────────────────────────────────────
// Certxa's default professional service image catalog, stored in R2.
// Images are organized by service category and available across salon websites,
// booking pages, and menus.
// Future: services.default_image_id → service_images.id

export const serviceImages = pgTable("service_images", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  category:     text("category").notNull(),
  subcategory:  text("subcategory"),
  imageUrl:     text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  r2Key:        text("r2_key"),
  description:  text("description"),
  sortOrder:    integer("sort_order").default(0),
  isActive:     boolean("is_active").default(true),
  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type ServiceImage = typeof serviceImages.$inferSelect;
export type InsertServiceImage = typeof serviceImages.$inferInsert;

// ─── Store Payment Accounts (Stripe Connect) ──────────────────────────────────
// Tracks connected payment processor accounts per salon.
// Completely isolated from the Certxa SaaS subscription billing system.
// Generic provider structure: provider = 'stripe' | 'square' | 'paypal' (future).

export const storePaymentAccounts = pgTable("store_payment_accounts", {
  id:                serial("id").primaryKey(),
  storeId:           integer("store_id").notNull().unique(),
  provider:          varchar("provider", { length: 32 }).notNull().default("stripe"),
  providerAccountId: text("provider_account_id").notNull(),
  status:            varchar("status", { length: 32 }).notNull().default("connected"),
  chargesEnabled:    boolean("charges_enabled").notNull().default(false),
  payoutsEnabled:    boolean("payouts_enabled").notNull().default(false),
  detailsSubmitted:  boolean("details_submitted").notNull().default(false),
  displayName:       text("display_name"),
  email:             text("email"),
  country:           text("country"),
  currency:          text("currency"),
  rawData:                    jsonb("raw_data").default({}),
  contractorExpressEnabled:   boolean("contractor_express_enabled").notNull().default(false),
  contractorPayoutMode:       varchar("contractor_payout_mode", { length: 16 }).notNull().default("manual"),
  createdAt:                  timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type StorePaymentAccount = typeof storePaymentAccounts.$inferSelect;
export type InsertStorePaymentAccount = typeof storePaymentAccounts.$inferInsert;

// ─── Payment Refunds (salon-initiated customer refunds) ───────────────────────
// Local audit trail; Stripe is the source of truth. Powers the refund history in
// the Payments & Payouts dashboard and attributes each refund to a Certxa user.
export const paymentRefunds = pgTable("payment_refunds", {
  id:                  serial("id").primaryKey(),
  storeId:             integer("store_id").notNull(),
  appointmentId:       integer("appointment_id"),
  stripeRefundId:      text("stripe_refund_id").notNull(),
  stripePaymentIntent: text("stripe_payment_intent"),
  stripeChargeId:      text("stripe_charge_id"),
  amountCents:         integer("amount_cents").notNull(),
  currency:            text("currency").notNull().default("usd"),
  status:              text("status").notNull().default("pending"),
  reason:              text("reason"),
  createdByUserId:     text("created_by_user_id"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PaymentRefund = typeof paymentRefunds.$inferSelect;
export type InsertPaymentRefund = typeof paymentRefunds.$inferInsert;

// ── Salon Resources (manicure stations, pedicure chairs, etc.) ─────────────────
export const salonResources = pgTable("salon_resources", {
  id:        serial("id").primaryKey(),
  storeId:   integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  type:      text("type").notNull(),       // 'station' | 'chair' | 'room' | 'seat'
  name:      text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive:  boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type SalonResource = typeof salonResources.$inferSelect;

// ── POS Grid Management ───────────────────────────────────────────────────────
export const posGrids = pgTable("pos_grids", {
  id:                 serial("id").primaryKey(),
  storeId:            integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name:               varchar("name", { length: 100 }).notNull().default("MAIN"),
  isLive:             boolean("is_live").notNull().default(false),
  isLocked:           boolean("is_locked").notNull().default(false),
  isActive:           boolean("is_active").notNull().default(true),
  internalCode:       varchar("internal_code", { length: 20 }),
  layoutType:         varchar("layout_type", { length: 30 }).notNull().default("fixed"),
  dynamicPopulation:  boolean("dynamic_population").notNull().default(false),
  navBehavior:        varchar("nav_behavior", { length: 20 }).notNull().default("stay"),
  targetGridId:       integer("target_grid_id"),
  rows:               integer("rows").notNull().default(6),
  cols:               integer("cols").notNull().default(4),
  dept:               integer("dept").notNull().default(0),
  posStatus:          integer("pos_status").notNull().default(0),
  createdAt:          timestamp("created_at").defaultNow(),
  updatedAt:          timestamp("updated_at").defaultNow(),
});
export type PosGrid = typeof posGrids.$inferSelect;

export const posGridSlots = pgTable("pos_grid_slots", {
  id:          serial("id").primaryKey(),
  gridId:      integer("grid_id").notNull().references(() => posGrids.id, { onDelete: "cascade" }),
  slotIndex:   integer("slot_index").notNull(),
  label:       varchar("label", { length: 200 }),
  serviceId:   integer("service_id").references(() => services.id, { onDelete: "set null" }),
  opensGridId: integer("opens_grid_id"),   // FK to pos_grids.id — no Drizzle ref to avoid circular dep
  bandColor:   varchar("band_color", { length: 30 }),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});
export type PosGridSlot = typeof posGridSlots.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// GBP OPTIMIZATION LOGS
// Tracks every automated action and recommendation made by the GBP
// Optimization Engine (Phase 1). Includes auto-syncs of safe fields,
// category recommendations, and audit sweep results.
// ─────────────────────────────────────────────────────────────────────────────
export const gbpOptimizationLogs = pgTable("gbp_optimization_logs", {
  id:                    serial("id").primaryKey(),
  storeId:               integer("store_id").references(() => locations.id, { onDelete: "cascade" }),
  locationResourceName:  text("location_resource_name"),   // GBP resource name at time of action
  action:                text("action").notNull(),          // 'sync_hours' | 'sync_description' | 'sync_booking_url' |
                                                            // 'sync_website_url' | 'sync_services' |
                                                            // 'category_recommendation' | 'audit_run' | 'sync_skipped'
  field:                 text("field"),                     // which GBP field was affected
  previousValue:         text("previous_value"),            // value before action (JSON or plain text)
  newValue:              text("new_value"),                 // value after action (JSON or plain text)
  status:                text("status").notNull().default("success"), // 'success' | 'failed' | 'skipped' | 'recommended'
  errorMessage:          text("error_message"),
  triggeredBy:           text("triggered_by").notNull().default("scheduler"), // 'scheduler' | 'manual'
  createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  gbpOptLogsStoreIdx:     index("gbp_opt_logs_store_id_idx").on(table.storeId),
  gbpOptLogsCreatedIdx:   index("gbp_opt_logs_created_at_idx").on(table.createdAt),
  gbpOptLogsActionIdx:    index("gbp_opt_logs_action_idx").on(table.action),
  gbpOptLogsStatusIdx:    index("gbp_opt_logs_status_idx").on(table.status),
}));

export type GbpOptimizationLog    = typeof gbpOptimizationLogs.$inferSelect;
export type InsertGbpOptimizationLog = typeof gbpOptimizationLogs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE REVIEW MANAGEMENT ENGINE (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

export const googleReviewEngineSettings = pgTable("google_review_engine_settings", {
  id:                         serial("id").primaryKey(),
  storeId:                    integer("store_id").references(() => locations.id).notNull().unique(),
  autoRespondEnabled:         boolean("auto_respond_enabled").notNull().default(true),
  minResponseDelayMinutes:    integer("min_response_delay_minutes").notNull().default(60),
  autoRespond5Star:           boolean("auto_respond_5_star").notNull().default(true),
  autoRespond4Star:           boolean("auto_respond_4_star").notNull().default(true),
  requireApproval3Star:       boolean("require_approval_3_star").notNull().default(true),
  notifyOwner12Star:          boolean("notify_owner_1_2_star").notNull().default(true),
  // Only auto-reply to reviews created within this many days. Reviews older than this
  // are silently skipped — prevents mass-replying to years of historical reviews on
  // first GBP connect. 0 = no age gate (reply to everything).
  maxReviewAgeDays:           integer("max_review_age_days").notNull().default(21),
  createdAt:                  timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:                  timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  greSettingsStoreIdx: index("gre_settings_store_id_idx").on(table.storeId),
}));

export const googleReviewResponseQueue = pgTable("google_review_response_queue", {
  id:                       serial("id").primaryKey(),
  storeId:                  integer("store_id").references(() => locations.id).notNull(),
  googleReviewId:           integer("google_review_id").references(() => googleReviews.id).notNull(),
  googleReviewResponseId:   integer("google_review_response_id").references(() => googleReviewResponses.id),
  rating:                   integer("rating").notNull(),
  // status: pending | scheduled | awaiting_approval | owner_notified | approved | published | cancelled | failed | not_found
  // 'not_found' — permanent terminal: Google returned 404 (review deleted); never retried or re-queued.
  // 'failed'    — transient terminal: OAuth expiry, API 5xx, etc.; eligible for retry on next sync.
  status:                   text("status").notNull().default("pending"),
  reviewReceivedAt:         timestamp("review_received_at", { withTimezone: true }),
  eligibleAfter:            timestamp("eligible_after", { withTimezone: true }),
  scheduledFor:             timestamp("scheduled_for", { withTimezone: true }),
  publishedAt:              timestamp("published_at", { withTimezone: true }),
  ownerNotifiedAt:          timestamp("owner_notified_at", { withTimezone: true }),
  generatedResponseText:    text("generated_response_text"),
  failureReason:            text("failure_reason"),
  attempts:                 integer("attempts").notNull().default(0),
  createdAt:                timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:                timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  grrqStoreIdx:       index("grrq_store_id_idx").on(table.storeId),
  grrqReviewIdx:      index("grrq_google_review_id_idx").on(table.googleReviewId),
  grrqStatusIdx:      index("grrq_status_idx").on(table.status),
  grrqScheduledIdx:   index("grrq_scheduled_for_idx").on(table.scheduledFor),
  // Only one "active" queue row per review at a time. 'failed' and 'cancelled' are
  // excluded so a transient failure can still be retried with a fresh row — this
  // matches the exclusion set in processNewReviewsForStore (google-review-engine.ts).
  // Without this, nothing stops duplicate rows for the same review from piling up,
  // and the dispatcher will fire a separate reply PUT for each one.
  grrqReviewUniqueIdx: uniqueIndex("grrq_review_unique_idx").on(table.googleReviewId)
    .where(sql`status IN ('pending','scheduled','awaiting_approval','approved','owner_notified','published','not_found')`),
}));

// ─── Review Sentiment Cache ───────────────────────────────────────────────────
// Stores the last AI-generated Review Themes & Sentiment result per store.
// One row per store; upserted on each re-analysis so storage stays bounded.
export const reviewSentimentCache = pgTable("review_sentiment_cache", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").notNull().unique(),
  themes:      jsonb("themes").notNull().default([]),
  reviewCount: integer("review_count").notNull().default(0),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow(),
});

export type ReviewSentimentCache = typeof reviewSentimentCache.$inferSelect;

export const googleReviewEngineSettingsRelations = relations(googleReviewEngineSettings, ({ one }) => ({
  store: one(locations, { fields: [googleReviewEngineSettings.storeId], references: [locations.id] }),
}));

export const googleReviewResponseQueueRelations = relations(googleReviewResponseQueue, ({ one }) => ({
  store:    one(locations,             { fields: [googleReviewResponseQueue.storeId],          references: [locations.id] }),
  review:   one(googleReviews,         { fields: [googleReviewResponseQueue.googleReviewId],   references: [googleReviews.id] }),
  response: one(googleReviewResponses, { fields: [googleReviewResponseQueue.googleReviewResponseId], references: [googleReviewResponses.id] }),
}));

export const insertGoogleReviewEngineSettingsSchema = createInsertSchema(googleReviewEngineSettings).omit({ id: true });
export const insertGoogleReviewResponseQueueSchema  = createInsertSchema(googleReviewResponseQueue).omit({ id: true });

export type GoogleReviewEngineSettings       = typeof googleReviewEngineSettings.$inferSelect;
export type InsertGoogleReviewEngineSettings = typeof googleReviewEngineSettings.$inferInsert;
export type GoogleReviewResponseQueue        = typeof googleReviewResponseQueue.$inferSelect;
export type InsertGoogleReviewResponseQueue  = typeof googleReviewResponseQueue.$inferInsert;

// ─── GBP Post Automation Engine (Phase 3.1) ───────────────────────────────────

export const gbpPostSettings = pgTable("gbp_post_settings", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").references(() => locations.id).notNull().unique(),
  autoPostEnabled:  boolean("auto_post_enabled").notNull().default(true),
  requireApproval:  boolean("require_approval").notNull().default(true),
  maxPostsPerWeek:  integer("max_posts_per_week").notNull().default(2),
  postDelayHours:   integer("post_delay_hours").notNull().default(2),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const gbpPostQueue = pgTable("gbp_post_queue", {
  id:                serial("id").primaryKey(),
  storeId:           integer("store_id").references(() => locations.id).notNull(),
  postType:          text("post_type").notNull(),      // WHATS_NEW | OFFER | EVENT | ALERT
  status:            text("status").notNull().default("draft"),
  sourceEventType:   text("source_event_type").notNull(),
  sourceEventId:     text("source_event_id"),          // e.g. "service:42"
  topicHash:         text("topic_hash").notNull(),      // SHA256 dedup key
  generatedSummary:  text("generated_summary").notNull(),
  generatedTitle:    text("generated_title"),
  ctaType:           text("cta_type"),                 // BOOK | LEARN_MORE | CALL
  ctaUrl:            text("cta_url"),
  mediaUrl:          text("media_url"),
  eligibleAfter:     timestamp("eligible_after",  { withTimezone: true }).notNull(),
  scheduledFor:      timestamp("scheduled_for",   { withTimezone: true }),
  gbpPostId:         text("gbp_post_id"),              // GBP resource name after publish
  publishResult:     jsonb("publish_result"),           // raw GBP API response
  attempts:          integer("attempts").notNull().default(0),
  failureReason:     text("failure_reason"),
  approvedAt:        timestamp("approved_at",    { withTimezone: true }),
  publishedAt:       timestamp("published_at",   { withTimezone: true }),
  createdAt:         timestamp("created_at",     { withTimezone: true }).defaultNow(),
  updatedAt:         timestamp("updated_at",     { withTimezone: true }).defaultNow(),
}, (table) => ({
  gbpqStoreIdx:       index("gbpq_store_id_idx").on(table.storeId),
  gbpqStatusIdx:      index("gbpq_status_idx").on(table.status),
  gbpqScheduledIdx:   index("gbpq_scheduled_for_idx").on(table.scheduledFor),
  gbpqCreatedIdx:     index("gbpq_created_at_idx").on(table.createdAt),
}));

export const gbpPostSettingsRelations = relations(gbpPostSettings, ({ one }) => ({
  store: one(locations, { fields: [gbpPostSettings.storeId], references: [locations.id] }),
}));

export const gbpPostQueueRelations = relations(gbpPostQueue, ({ one }) => ({
  store: one(locations, { fields: [gbpPostQueue.storeId], references: [locations.id] }),
}));

export const insertGbpPostSettingsSchema = createInsertSchema(gbpPostSettings).omit({ id: true });
export const insertGbpPostQueueSchema    = createInsertSchema(gbpPostQueue).omit({ id: true });

export type GbpPostSettings       = typeof gbpPostSettings.$inferSelect;
export type InsertGbpPostSettings = typeof gbpPostSettings.$inferInsert;
export type GbpPostQueue          = typeof gbpPostQueue.$inferSelect;
export type InsertGbpPostQueue    = typeof gbpPostQueue.$inferInsert;

// ─── GBP Photo Automation Engine (Phase 3.2) ──────────────────────────────────

export const gbpPhotoSettings = pgTable("gbp_photo_settings", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").notNull().unique().references(() => locations.id),
  enabled:          boolean("enabled").notNull().default(true),
  maxPhotosPerDay:  integer("max_photos_per_day").notNull().default(3),
  minHoursBetween:  integer("min_hours_between").notNull().default(4),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gbpPhotoQueue = pgTable("gbp_photo_queue", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").notNull().references(() => locations.id),
  imageUrl:         text("image_url").notNull(),
  imageR2Key:       text("image_r2_key"),
  sourceType:       text("source_type").notNull(),
  serviceId:        integer("service_id"),
  staffId:          integer("staff_id"),
  googleLocationId: text("google_location_id"),
  status:           text("status").notNull().default("pending"),
  scheduledFor:     timestamp("scheduled_for", { withTimezone: true }),
  uploadedPhotoId:  text("uploaded_photo_id"),
  aiDescription:    text("ai_description"),
  aiTags:           text("ai_tags").array(),
  attempts:         integer("attempts").notNull().default(0),
  errorMessage:     text("error_message"),
  apiResponse:      jsonb("api_response"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gbpPhotoSettingsRelations = relations(gbpPhotoSettings, ({ one }) => ({
  store: one(locations, { fields: [gbpPhotoSettings.storeId], references: [locations.id] }),
}));

export const gbpPhotoQueueRelations = relations(gbpPhotoQueue, ({ one }) => ({
  store: one(locations, { fields: [gbpPhotoQueue.storeId], references: [locations.id] }),
}));

export const insertGbpPhotoSettingsSchema = createInsertSchema(gbpPhotoSettings).omit({ id: true });
export const insertGbpPhotoQueueSchema    = createInsertSchema(gbpPhotoQueue).omit({ id: true });

export type GbpPhotoSettings       = typeof gbpPhotoSettings.$inferSelect;
export type InsertGbpPhotoSettings = typeof gbpPhotoSettings.$inferInsert;
export type GbpPhotoQueue          = typeof gbpPhotoQueue.$inferSelect;
export type InsertGbpPhotoQueue    = typeof gbpPhotoQueue.$inferInsert;

// ─── Staff Work Photos — Phase 3.2A ──────────────────────────────────────────

export const staffWorkPhotos = pgTable("staff_work_photos", {
  id:             serial("id").primaryKey(),
  storeId:        integer("store_id").notNull().references(() => locations.id),
  staffId:        integer("staff_id").notNull().references(() => staff.id),
  appointmentId:  integer("appointment_id").references(() => appointments.id),
  serviceId:      integer("service_id").references(() => services.id),
  clientId:       integer("client_id"),          // soft ref — nullable (walk-ins, display shots)
  imageUrl:       text("image_url").notNull(),
  imageR2Key:     text("image_r2_key"),
  aiDescription:  text("ai_description"),
  aiTags:         text("ai_tags").array(),
  staffCaption:   text("staff_caption"),
  gbpQueued:      boolean("gbp_queued").notNull().default(false),
  gbpQueueId:     integer("gbp_queue_id").references(() => gbpPhotoQueue.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffWorkPhotosRelations = relations(staffWorkPhotos, ({ one }) => ({
  store:       one(locations,    { fields: [staffWorkPhotos.storeId],       references: [locations.id] }),
  staffMember: one(staff,        { fields: [staffWorkPhotos.staffId],       references: [staff.id] }),
  appointment: one(appointments, { fields: [staffWorkPhotos.appointmentId], references: [appointments.id] }),
  service:     one(services,     { fields: [staffWorkPhotos.serviceId],     references: [services.id] }),
}));

// Per-client photo consent — opt-out model (no record = GBP allowed by default)
export const clientPhotoPermissions = pgTable("client_photo_permissions", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").notNull(),
  clientId:         integer("client_id").notNull(),
  gbpAllowed:       boolean("gbp_allowed").notNull().default(true),
  websiteAllowed:   boolean("website_allowed").notNull().default(true),
  marketingAllowed: boolean("marketing_allowed").notNull().default(false), // explicit opt-in only
  consentMethod:    text("consent_method"),   // 'staff_portal' | 'owner_manual' | 'kiosk'
  consentedAt:      timestamp("consented_at", { withTimezone: true }),
  notes:            text("notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Website Gallery Photos ────────────────────────────────────────────────────
// Photos explicitly uploaded by owners for their website gallery + GBP.
// Created by migration 0125. NOT in tablesFilter exclusions (Drizzle manages it).

export const wbGalleryPhotos = pgTable("wb_gallery_photos", {
  id:            serial("id").primaryKey(),
  storeId:       integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  imageUrl:      text("image_url").notNull(),
  imageR2Key:    text("image_r2_key"),
  caption:       text("caption"),
  showOnWebsite: boolean("show_on_website").notNull().default(true),
  gbpQueueId:    integer("gbp_queue_id").references(() => gbpPhotoQueue.id),
  sortOrder:     integer("sort_order").notNull().default(0),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wbGalleryPhotosRelations = relations(wbGalleryPhotos, ({ one }) => ({
  store: one(locations, { fields: [wbGalleryPhotos.storeId], references: [locations.id] }),
  gbpQueue: one(gbpPhotoQueue, { fields: [wbGalleryPhotos.gbpQueueId], references: [gbpPhotoQueue.id] }),
}));

export type WbGalleryPhoto       = typeof wbGalleryPhotos.$inferSelect;
export type InsertWbGalleryPhoto = typeof wbGalleryPhotos.$inferInsert;

export const insertStaffWorkPhotosSchema    = createInsertSchema(staffWorkPhotos).omit({ id: true });
export const insertClientPhotoPermissionsSchema = createInsertSchema(clientPhotoPermissions).omit({ id: true });

export type StaffWorkPhoto            = typeof staffWorkPhotos.$inferSelect;
export type InsertStaffWorkPhoto      = typeof staffWorkPhotos.$inferInsert;
export type ClientPhotoPermission     = typeof clientPhotoPermissions.$inferSelect;
export type InsertClientPhotoPermission = typeof clientPhotoPermissions.$inferInsert;

// contractorCommissions — defined in ./schema/payouts (where `contractors` is in scope)
// and re-exported above with the rest of the payouts tables.

// ═════════════════════════════════════════════════════════════════════════════
// NAIL CONFIGURATION  —  migration 0154
//
// Store-owned length / shape / art configuration for fake-nail services.
//   • 4 vocabulary tables (nail_sizes, nail_shapes, nail_art_applications,
//     nail_art_effects)          — every row owned by one store
//   • nail_service_configs        — 1 row per fake-nail service (the gate)
//   • 4 service→vocab junctions   — per-service availability + price delta
//
// Pricing lives ONLY on the junctions, as a signed NUMERIC(10,2) delta vs
// services.price. Art price = application delta + effect delta. Combination
// totals are never stored. The existing addons / service_addons /
// appointment_addons / service_options system is untouched and runs alongside.
// ═════════════════════════════════════════════════════════════════════════════

// ── Vocabularies (store-owned) ───────────────────────────────────────────────

export const nailSizes = pgTable("nail_sizes", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  code:        text("code"),                 // stable slug from the catalog template; seeding key
  name:        text("name").notNull(),       // editable display label ("Short", "Medium", …)
  description: text("description"),
  imageUrl:    text("image_url"),            // optional photo for picker cards (kiosk, POS)
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("nail_sizes_store_id_name_key").on(table.storeId, table.name),
  unique("nail_sizes_store_id_code_key").on(table.storeId, table.code),
  index("nail_sizes_store_id_idx").on(table.storeId),
]);

export const nailShapes = pgTable("nail_shapes", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  code:        text("code"),
  name:        text("name").notNull(),
  description: text("description"),
  imageUrl:    text("image_url"),            // optional photo for picker cards (kiosk, POS)
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("nail_shapes_store_id_name_key").on(table.storeId, table.name),
  unique("nail_shapes_store_id_code_key").on(table.storeId, table.code),
  index("nail_shapes_store_id_idx").on(table.storeId),
]);

export const nailArtApplications = pgTable("nail_art_applications", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  code:        text("code"),
  name:        text("name").notNull(),
  description: text("description"),
  imageUrl:    text("image_url"),            // optional photo for picker cards (kiosk, POS)
  isQuote:     boolean("is_quote").notNull().default(false),  // e.g. "Custom Nail Art" — priced at booking
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("nail_art_applications_store_id_name_key").on(table.storeId, table.name),
  unique("nail_art_applications_store_id_code_key").on(table.storeId, table.code),
  index("nail_art_applications_store_id_idx").on(table.storeId),
]);

export const nailArtEffects = pgTable("nail_art_effects", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  code:        text("code"),
  name:        text("name").notNull(),
  description: text("description"),
  imageUrl:    text("image_url"),
  swatchHex:   text("swatch_hex"),
  sortOrder:   integer("sort_order").notNull().default(0),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("nail_art_effects_store_id_name_key").on(table.storeId, table.name),
  unique("nail_art_effects_store_id_code_key").on(table.storeId, table.code),
  index("nail_art_effects_store_id_idx").on(table.storeId),
]);

// ── Per-service gate ─────────────────────────────────────────────────────────

export const nailServiceConfigs = pgTable("nail_service_configs", {
  id:             serial("id").primaryKey(),
  storeId:        integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId:      integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  isEnabled:      boolean("is_enabled").notNull().default(true),
  lengthRequired: boolean("length_required").notNull().default(true),
  shapeRequired:  boolean("shape_required").notNull().default(true),
  artRequired:    boolean("art_required").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("nail_service_configs_service_id_key").on(table.serviceId),
  index("nail_service_configs_store_id_idx").on(table.storeId),
]);

// ── Service → vocabulary junctions (pricing lives here) ──────────────────────

export const serviceNailSizes = pgTable("service_nail_sizes", {
  id:                 serial("id").primaryKey(),
  storeId:            integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId:          integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  nailSizeId:         integer("nail_size_id").notNull().references(() => nailSizes.id, { onDelete: "restrict" }),
  priceAdjustment:    decimal("price_adjustment", { precision: 10, scale: 2 }).notNull().default("0"),
  durationAdjustment: integer("duration_adjustment").notNull().default(0),
  isDefault:          boolean("is_default").notNull().default(false),
  isEnabled:          boolean("is_enabled").notNull().default(true),
  sortOrder:          integer("sort_order").notNull().default(0),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("service_nail_sizes_service_id_nail_size_id_key").on(table.serviceId, table.nailSizeId),
  uniqueIndex("service_nail_sizes_one_default_idx").on(table.serviceId).where(sql`is_default`),
  index("service_nail_sizes_service_id_idx").on(table.serviceId),
  index("service_nail_sizes_store_id_idx").on(table.storeId),
  index("service_nail_sizes_nail_size_id_idx").on(table.nailSizeId),
]);

export const serviceNailShapes = pgTable("service_nail_shapes", {
  id:                 serial("id").primaryKey(),
  storeId:            integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId:          integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  nailShapeId:        integer("nail_shape_id").notNull().references(() => nailShapes.id, { onDelete: "restrict" }),
  priceAdjustment:    decimal("price_adjustment", { precision: 10, scale: 2 }).notNull().default("0"),
  durationAdjustment: integer("duration_adjustment").notNull().default(0),
  isDefault:          boolean("is_default").notNull().default(false),
  isEnabled:          boolean("is_enabled").notNull().default(true),
  sortOrder:          integer("sort_order").notNull().default(0),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("service_nail_shapes_service_id_nail_shape_id_key").on(table.serviceId, table.nailShapeId),
  uniqueIndex("service_nail_shapes_one_default_idx").on(table.serviceId).where(sql`is_default`),
  index("service_nail_shapes_service_id_idx").on(table.serviceId),
  index("service_nail_shapes_store_id_idx").on(table.storeId),
  index("service_nail_shapes_nail_shape_id_idx").on(table.nailShapeId),
]);

export const serviceNailArtApplications = pgTable("service_nail_art_applications", {
  id:                  serial("id").primaryKey(),
  storeId:             integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId:           integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  nailArtApplicationId: integer("nail_art_application_id").notNull().references(() => nailArtApplications.id, { onDelete: "restrict" }),
  priceAdjustment:     decimal("price_adjustment", { precision: 10, scale: 2 }).notNull().default("0"),
  durationAdjustment:  integer("duration_adjustment").notNull().default(0),
  isEnabled:           boolean("is_enabled").notNull().default(true),
  sortOrder:           integer("sort_order").notNull().default(0),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("service_nail_art_applications_svc_app_key").on(table.serviceId, table.nailArtApplicationId),
  index("service_nail_art_applications_service_id_idx").on(table.serviceId),
  index("service_nail_art_applications_store_id_idx").on(table.storeId),
  index("service_nail_art_applications_app_id_idx").on(table.nailArtApplicationId),
]);

export const serviceNailArtEffects = pgTable("service_nail_art_effects", {
  id:                 serial("id").primaryKey(),
  storeId:            integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  serviceId:          integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  nailArtEffectId:    integer("nail_art_effect_id").notNull().references(() => nailArtEffects.id, { onDelete: "restrict" }),
  priceAdjustment:    decimal("price_adjustment", { precision: 10, scale: 2 }).notNull().default("0"),  // surcharge, usually 0
  durationAdjustment: integer("duration_adjustment").notNull().default(0),
  isEnabled:          boolean("is_enabled").notNull().default(true),
  sortOrder:          integer("sort_order").notNull().default(0),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("service_nail_art_effects_svc_effect_key").on(table.serviceId, table.nailArtEffectId),
  index("service_nail_art_effects_service_id_idx").on(table.serviceId),
  index("service_nail_art_effects_store_id_idx").on(table.storeId),
  index("service_nail_art_effects_effect_id_idx").on(table.nailArtEffectId),
]);

// ── Relations ────────────────────────────────────────────────────────────────

export const nailSizesRelations = relations(nailSizes, ({ one, many }) => ({
  store: one(locations, { fields: [nailSizes.storeId], references: [locations.id] }),
  serviceLinks: many(serviceNailSizes),
}));
export const nailShapesRelations = relations(nailShapes, ({ one, many }) => ({
  store: one(locations, { fields: [nailShapes.storeId], references: [locations.id] }),
  serviceLinks: many(serviceNailShapes),
}));
export const nailArtApplicationsRelations = relations(nailArtApplications, ({ one, many }) => ({
  store: one(locations, { fields: [nailArtApplications.storeId], references: [locations.id] }),
  serviceLinks: many(serviceNailArtApplications),
}));
export const nailArtEffectsRelations = relations(nailArtEffects, ({ one, many }) => ({
  store: one(locations, { fields: [nailArtEffects.storeId], references: [locations.id] }),
  serviceLinks: many(serviceNailArtEffects),
}));
export const nailServiceConfigsRelations = relations(nailServiceConfigs, ({ one }) => ({
  store: one(locations, { fields: [nailServiceConfigs.storeId], references: [locations.id] }),
  service: one(services, { fields: [nailServiceConfigs.serviceId], references: [services.id] }),
}));
export const serviceNailSizesRelations = relations(serviceNailSizes, ({ one }) => ({
  store: one(locations, { fields: [serviceNailSizes.storeId], references: [locations.id] }),
  service: one(services, { fields: [serviceNailSizes.serviceId], references: [services.id] }),
  nailSize: one(nailSizes, { fields: [serviceNailSizes.nailSizeId], references: [nailSizes.id] }),
}));
export const serviceNailShapesRelations = relations(serviceNailShapes, ({ one }) => ({
  store: one(locations, { fields: [serviceNailShapes.storeId], references: [locations.id] }),
  service: one(services, { fields: [serviceNailShapes.serviceId], references: [services.id] }),
  nailShape: one(nailShapes, { fields: [serviceNailShapes.nailShapeId], references: [nailShapes.id] }),
}));
export const serviceNailArtApplicationsRelations = relations(serviceNailArtApplications, ({ one }) => ({
  store: one(locations, { fields: [serviceNailArtApplications.storeId], references: [locations.id] }),
  service: one(services, { fields: [serviceNailArtApplications.serviceId], references: [services.id] }),
  application: one(nailArtApplications, { fields: [serviceNailArtApplications.nailArtApplicationId], references: [nailArtApplications.id] }),
}));
export const serviceNailArtEffectsRelations = relations(serviceNailArtEffects, ({ one }) => ({
  store: one(locations, { fields: [serviceNailArtEffects.storeId], references: [locations.id] }),
  service: one(services, { fields: [serviceNailArtEffects.serviceId], references: [services.id] }),
  effect: one(nailArtEffects, { fields: [serviceNailArtEffects.nailArtEffectId], references: [nailArtEffects.id] }),
}));

// ── Insert schemas + types ───────────────────────────────────────────────────

export const insertNailSizeSchema                 = createInsertSchema(nailSizes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNailShapeSchema                = createInsertSchema(nailShapes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNailArtApplicationSchema       = createInsertSchema(nailArtApplications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNailArtEffectSchema            = createInsertSchema(nailArtEffects).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNailServiceConfigSchema        = createInsertSchema(nailServiceConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceNailSizeSchema          = createInsertSchema(serviceNailSizes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceNailShapeSchema         = createInsertSchema(serviceNailShapes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceNailArtApplicationSchema = createInsertSchema(serviceNailArtApplications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceNailArtEffectSchema     = createInsertSchema(serviceNailArtEffects).omit({ id: true, createdAt: true, updatedAt: true });

export type NailSize                  = typeof nailSizes.$inferSelect;
export type InsertNailSize            = typeof nailSizes.$inferInsert;
export type NailShape                 = typeof nailShapes.$inferSelect;
export type InsertNailShape           = typeof nailShapes.$inferInsert;
export type NailArtApplication        = typeof nailArtApplications.$inferSelect;
export type InsertNailArtApplication  = typeof nailArtApplications.$inferInsert;
export type NailArtEffect             = typeof nailArtEffects.$inferSelect;
export type InsertNailArtEffect       = typeof nailArtEffects.$inferInsert;
export type NailServiceConfig         = typeof nailServiceConfigs.$inferSelect;
export type InsertNailServiceConfig   = typeof nailServiceConfigs.$inferInsert;
export type ServiceNailSize           = typeof serviceNailSizes.$inferSelect;
export type InsertServiceNailSize     = typeof serviceNailSizes.$inferInsert;
export type ServiceNailShape          = typeof serviceNailShapes.$inferSelect;
export type InsertServiceNailShape    = typeof serviceNailShapes.$inferInsert;
export type ServiceNailArtApplication       = typeof serviceNailArtApplications.$inferSelect;
export type InsertServiceNailArtApplication = typeof serviceNailArtApplications.$inferInsert;
export type ServiceNailArtEffect      = typeof serviceNailArtEffects.$inferSelect;
export type InsertServiceNailArtEffect = typeof serviceNailArtEffects.$inferInsert;

// ── Booking-time nail selection  (migration 0155) ───────────────────────────
//
// One row per appointment whose service is a fake-nail service. Every value is
// SNAPSHOTTED at booking time so a receipt never changes when the salon edits
// its config later. FKs to the config/vocab rows are provenance only
// (ON DELETE SET NULL); the *_snapshot columns are the source of truth.

export const appointmentNailSelection = pgTable("appointment_nail_selection", {
  id:                serial("id").primaryKey(),
  appointmentId:     integer("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  storeId:           integer("store_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  basePriceSnapshot: decimal("base_price_snapshot", { precision: 10, scale: 2 }).notNull(),

  // length
  nailSizeId:                 integer("nail_size_id").references(() => nailSizes.id, { onDelete: "set null" }),
  lengthNameSnapshot:         text("length_name_snapshot"),
  lengthPriceAdjSnapshot:     decimal("length_price_adj_snapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  lengthDurationAdjSnapshot:  integer("length_duration_adj_snapshot").notNull().default(0),

  // shape
  nailShapeId:                integer("nail_shape_id").references(() => nailShapes.id, { onDelete: "set null" }),
  shapeNameSnapshot:          text("shape_name_snapshot"),
  shapePriceAdjSnapshot:      decimal("shape_price_adj_snapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  shapeDurationAdjSnapshot:   integer("shape_duration_adj_snapshot").notNull().default(0),

  // art
  nailArtApplicationId:       integer("nail_art_application_id").references(() => nailArtApplications.id, { onDelete: "set null" }),
  nailArtEffectId:            integer("nail_art_effect_id").references(() => nailArtEffects.id, { onDelete: "set null" }),
  artApplicationNameSnapshot: text("art_application_name_snapshot"),
  artEffectNameSnapshot:      text("art_effect_name_snapshot"),
  artPriceAdjSnapshot:        decimal("art_price_adj_snapshot", { precision: 10, scale: 2 }).notNull().default("0"),
  artDurationAdjSnapshot:     integer("art_duration_adj_snapshot").notNull().default(0),
  artIsCustomQuote:           boolean("art_is_custom_quote").notNull().default(false),

  totalPriceSnapshot: decimal("total_price_snapshot", { precision: 10, scale: 2 }).notNull(),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("appointment_nail_selection_appointment_id_key").on(table.appointmentId),
  index("appointment_nail_selection_store_id_idx").on(table.storeId),
]);

export const appointmentNailSelectionRelations = relations(appointmentNailSelection, ({ one }) => ({
  appointment: one(appointments, { fields: [appointmentNailSelection.appointmentId], references: [appointments.id] }),
  store: one(locations, { fields: [appointmentNailSelection.storeId], references: [locations.id] }),
  nailSize: one(nailSizes, { fields: [appointmentNailSelection.nailSizeId], references: [nailSizes.id] }),
  nailShape: one(nailShapes, { fields: [appointmentNailSelection.nailShapeId], references: [nailShapes.id] }),
  application: one(nailArtApplications, { fields: [appointmentNailSelection.nailArtApplicationId], references: [nailArtApplications.id] }),
  effect: one(nailArtEffects, { fields: [appointmentNailSelection.nailArtEffectId], references: [nailArtEffects.id] }),
}));

export const insertAppointmentNailSelectionSchema = createInsertSchema(appointmentNailSelection).omit({ id: true, createdAt: true, updatedAt: true });

export type AppointmentNailSelection       = typeof appointmentNailSelection.$inferSelect;
export type InsertAppointmentNailSelection = typeof appointmentNailSelection.$inferInsert;
