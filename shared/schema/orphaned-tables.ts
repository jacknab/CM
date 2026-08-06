import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Sequences owned by SQL-migration-only tables ─────────────────────────────
// These tables are excluded from drizzle-kit management via tablesFilter in
// drizzle.config.ts.  drizzle-kit 0.31 scans sequences independently of
// tablesFilter and tries to DROP any sequence it doesn't recognise as managed.
// Declaring them here marks them as "known" so drizzle-kit leaves them alone.
// Sequences owned by tablesFilter-excluded tables (SQL-migration-managed tables).
// drizzle-kit 0.31 scans sequences independently of tablesFilter and tries to DROP
// any it doesn't recognise as managed.  Declaring them here marks them as known so
// drizzle-kit leaves them alone.
//
// All are integer-typed (SERIAL) — maxValue must be 2147483647 (integer max) or
// drizzle-kit will try to ALTER MAXVALUE to bigint's 9223372036854775807, which
// Postgres rejects for integer-typed sequences.
const _intSeqOpts = { startWith: 1, increment: 1, maxValue: 2147483647 } as const;

export const platformSettingsIdSeq          = pgSequence("platform_settings_id_seq",          _intSeqOpts);
export const dataTransferJobsIdSeq          = pgSequence("data_transfer_jobs_id_seq",          _intSeqOpts);
export const dataTransferJobsIdSeq1         = pgSequence("data_transfer_jobs_id_seq1",         _intSeqOpts);
export const supportEscalationsIdSeq        = pgSequence("support_escalations_id_seq",         _intSeqOpts);
export const supportEscalationsIdSeq1       = pgSequence("support_escalations_id_seq1",        _intSeqOpts);
export const supportMacrosIdSeq             = pgSequence("support_macros_id_seq",              _intSeqOpts);
export const supportMacrosIdSeq1            = pgSequence("support_macros_id_seq1",             _intSeqOpts);
export const supportTasksIdSeq              = pgSequence("support_tasks_id_seq",               _intSeqOpts);
export const supportTasksIdSeq1             = pgSequence("support_tasks_id_seq1",              _intSeqOpts);
// Multilingual content translations table (0074_entity_translations.sql) — excluded via tablesFilter
export const entityTranslationsIdSeq        = pgSequence("entity_translations_id_seq",         _intSeqOpts);

// ─── billing_activity_logs ────────────────────────────────────────────────────
export const billingActivityLogs = pgTable("billing_activity_logs", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id"),
  userId: text("user_id"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  message: text("message").notNull(),
  metadataJson: jsonb("metadata_json"),
  source: text("source").default("system"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── conversations ────────────────────────────────────────────────────────────
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── customer_billing_profiles ───────────────────────────────────────────────
export const customerBillingProfiles = pgTable("customer_billing_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  salonId: integer("salon_id"),
  stripeCustomerId: text("stripe_customer_id"),
  defaultPaymentMethodId: text("default_payment_method_id"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  billingPhone: text("billing_phone"),
  billingAddressLine1: text("billing_address_line1"),
  billingAddressLine2: text("billing_address_line2"),
  billingCity: text("billing_city"),
  billingState: text("billing_state"),
  billingZip: text("billing_zip"),
  billingCountry: text("billing_country").default("US"),
  taxExemptStatus: text("tax_exempt_status").default("none"),
  preferredCurrency: text("preferred_currency").default("usd"),
  currentPlanId: integer("current_plan_id"),
  currentSubscriptionStatus: text("current_subscription_status").default("none"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  canceledAt: timestamp("canceled_at"),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  lifetimeValueCents: bigint("lifetime_value_cents", { mode: "number" }).default(0),
  totalSuccessfulPayments: integer("total_successful_payments").default(0),
  totalFailedPayments: integer("total_failed_payments").default(0),
  lastPaymentDate: timestamp("last_payment_date"),
  lastPaymentAmountCents: bigint("last_payment_amount_cents", { mode: "number" }),
  lastFailedPaymentDate: timestamp("last_failed_payment_date"),
  lastFailedPaymentReason: text("last_failed_payment_reason"),
  delinquent: boolean("delinquent").default(false),
  accountHold: boolean("account_hold").default(false),
  internalBillingNotes: text("internal_billing_notes"),
  accountStatus: text("account_status").default("active"),
  suspendedAt: timestamp("suspended_at"),
  lockedAt: timestamp("locked_at"),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── invoice_records ──────────────────────────────────────────────────────────
export const invoiceRecords = pgTable("invoice_records", {
  id: serial("id").primaryKey(),
  stripeInvoiceId: text("stripe_invoice_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  salonId: integer("salon_id"),
  invoiceNumber: text("invoice_number"),
  status: text("status"),
  paid: boolean("paid").default(false),
  attempted: boolean("attempted").default(false),
  forgiven: boolean("forgiven").default(false),
  collectionMethod: text("collection_method"),
  currency: text("currency").default("usd"),
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).default(0),
  taxCents: bigint("tax_cents", { mode: "number" }).default(0),
  totalCents: bigint("total_cents", { mode: "number" }).default(0),
  amountPaidCents: bigint("amount_paid_cents", { mode: "number" }).default(0),
  amountRemainingCents: bigint("amount_remaining_cents", { mode: "number" }).default(0),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  invoicePdfUrl: text("invoice_pdf_url"),
  billingReason: text("billing_reason"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  attemptedAt: timestamp("attempted_at"),
  nextPaymentAttempt: timestamp("next_payment_attempt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── payment_transactions ─────────────────────────────────────────────────────
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  salonId: integer("salon_id"),
  userId: text("user_id"),
  status: text("status"),
  paymentMethodBrand: text("payment_method_brand"),
  paymentMethodLast4: text("payment_method_last4"),
  paymentMethodFingerprint: text("payment_method_fingerprint"),
  cardExpMonth: integer("card_exp_month"),
  cardExpYear: integer("card_exp_year"),
  amountCents: bigint("amount_cents", { mode: "number" }).default(0),
  currency: text("currency").default("usd"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  receiptUrl: text("receipt_url"),
  refunded: boolean("refunded").default(false),
  refundAmountCents: bigint("refund_amount_cents", { mode: "number" }).default(0),
  disputeStatus: text("dispute_status"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── refunds ──────────────────────────────────────────────────────────────────
export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  stripeRefundId: text("stripe_refund_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  salonId: integer("salon_id"),
  userId: text("user_id"),
  initiatedByUserId: text("initiated_by_user_id"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").default("usd"),
  reason: text("reason"),
  internalReasonNotes: text("internal_reason_notes"),
  refundType: text("refund_type").default("manual"),
  status: text("status").notNull().default("pending"),
  receiptUrl: text("receipt_url"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── scheduled_plan_changes ───────────────────────────────────────────────────
export const scheduledPlanChanges = pgTable("scheduled_plan_changes", {
  id: serial("id").primaryKey(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  newPlanCode: text("new_plan_code").notNull(),
  interval: text("interval"),
  effectiveAt: bigint("effective_at", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── stripe_customers ─────────────────────────────────────────────────────────
export const stripeCustomers = pgTable("stripe_customers", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  customerId: text("customer_id").notNull().unique(),
  storeNumber: integer("store_number").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── stripe_orders ────────────────────────────────────────────────────────────
export const stripeOrders = pgTable("stripe_orders", {
  id: serial("id").primaryKey(),
  checkoutSessionId: text("checkout_session_id").notNull(),
  paymentIntentId: text("payment_intent_id").notNull(),
  customerId: text("customer_id").notNull(),
  amountSubtotal: bigint("amount_subtotal", { mode: "number" }).notNull(),
  amountTotal: bigint("amount_total", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  paymentStatus: text("payment_status").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── stripe_settings ──────────────────────────────────────────────────────────
export const stripeSettings = pgTable("stripe_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  publishableKey: text("publishable_key"),
  secretKey: text("secret_key"),
  testMagstripeEnabled: boolean("test_magstripe_enabled").notNull().default(true),
});

// ─── stripe_subscriptions ─────────────────────────────────────────────────────
export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  id: serial("id").primaryKey(),
  customerId: text("customer_id").notNull().unique(),
  subscriptionId: text("subscription_id"),
  priceId: text("price_id"),
  currentPeriodStart: bigint("current_period_start", { mode: "number" }),
  currentPeriodEnd: bigint("current_period_end", { mode: "number" }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  paymentMethodBrand: text("payment_method_brand"),
  paymentMethodLast4: text("payment_method_last4"),
  status: text("status").notNull().default("not_started"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// ─── stripe_webhook_events ────────────────────────────────────────────────────
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: serial("id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  apiVersion: text("api_version"),
  processed: boolean("processed").default(false),
  processingAttempts: integer("processing_attempts").default(0),
  processingError: text("processing_error"),
  payloadJson: jsonb("payload_json"),
  receivedAt: timestamp("received_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// ─── subscription_plan_changes ────────────────────────────────────────────────
export const subscriptionPlanChanges = pgTable("subscription_plan_changes", {
  id: serial("id").primaryKey(),
  salonId: integer("salon_id"),
  userId: text("user_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  oldPlanId: integer("old_plan_id"),
  newPlanId: integer("new_plan_id"),
  oldPriceCents: bigint("old_price_cents", { mode: "number" }),
  newPriceCents: bigint("new_price_cents", { mode: "number" }),
  changeType: text("change_type"),
  prorationUsed: boolean("proration_used").default(false),
  proratedAmountCents: bigint("prorated_amount_cents", { mode: "number" }),
  effectiveDate: timestamp("effective_date"),
  initiatedBy: text("initiated_by"),
  reason: text("reason"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── support_account_tags ─────────────────────────────────────────────────────
export const supportAccountTags = pgTable("support_account_tags", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  tag: text("tag").notNull(),
  color: text("color").notNull().default("slate"),
  createdByAgentId: integer("created_by_agent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── support_incidents ────────────────────────────────────────────────────────
export const supportIncidents = pgTable("support_incidents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull().default("SEV-3"),
  status: text("status").notNull().default("investigating"),
  affectedAccounts: integer("affected_accounts").default(0),
  ownerId: integer("owner_id"),
  ownerName: text("owner_name"),
  services: text("services").array().default([]),
  rootCause: text("root_cause"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── support_incident_tasks ───────────────────────────────────────────────────
export const supportIncidentTasks = pgTable("support_incident_tasks", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull(),
  title: text("title").notNull(),
  assignedToId: integer("assigned_to_id"),
  assignedToName: text("assigned_to_name"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── support_incident_updates ─────────────────────────────────────────────────
export const supportIncidentUpdates = pgTable("support_incident_updates", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull(),
  content: text("content").notNull(),
  status: text("status"),
  authorId: integer("author_id"),
  authorName: text("author_name"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── support_notes ────────────────────────────────────────────────────────────
export const supportNotes = pgTable("support_notes", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  agentId: integer("agent_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  agentName: text("agent_name").notNull().default(""),
});

// ─── live_chat_departments ───────────────────────────────────────────────────
// Created by migration 0057_live_chat.sql, extended by 0061_live_chat_routing.sql
export const liveChatDepartments = pgTable("live_chat_departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  routingKeywords: text("routing_keywords"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── live_chats ──────────────────────────────────────────────────────────────
export const liveChats = pgTable("live_chats", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  visitorName: text("visitor_name"),
  visitorEmail: text("visitor_email"),
  visitorToken: text("visitor_token"),
  departmentId: integer("department_id"),
  agentId: integer("agent_id"),
  accountId: text("account_id"),
  status: text("status").notNull().default("queued"),
  subject: text("subject"),
  pageUrl: text("page_url"),
  routedBy: text("routed_by").default("manual"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  rating: integer("rating"),
  ratingComment: text("rating_comment"),
}, (t) => [
  index("idx_live_chats_status").on(t.status),
  index("idx_live_chats_agent_id").on(t.agentId),
]);

// ─── live_chat_messages ──────────────────────────────────────────────────────
export const liveChatMessages = pgTable("live_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  chatId: uuid("chat_id").notNull(),
  senderType: text("sender_type").notNull(),
  senderId: integer("sender_id"),
  senderName: text("sender_name"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_live_chat_msgs_chat").on(t.chatId, t.createdAt),
]);

// ─── live_chat_canned ────────────────────────────────────────────────────────
export const liveChatCanned = pgTable("live_chat_canned", {
  id: serial("id").primaryKey(),
  shortcut: text("shortcut").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("live_chat_canned_shortcut_key").on(t.shortcut),
]);

// ─── live_chat_agent_departments ─────────────────────────────────────────────
// Created by migration 0061_live_chat_routing.sql
export const liveChatAgentDepartments = pgTable("live_chat_agent_departments", {
  agentId: integer("agent_id").notNull(),
  departmentId: integer("department_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── processed_emails ────────────────────────────────────────────────────────
// Tracks IMAP message-IDs already imported so we never create duplicate tickets.
// Created by migration 0059_email_ticket_sync.sql.
export const processedEmails = pgTable("processed_emails", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(),
  ticketId: integer("ticket_id"),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("processed_emails_message_id_key").on(t.messageId),
  index("idx_processed_emails_message_id").on(t.messageId),
]);

// ─── blog_posts ──────────────────────────────────────────────────────────────
// Certxa marketing blog. Managed from /isadmin/blog in the back office;
// served publicly at /blog. Created by migration 0085_blog_posts.sql.
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  authorName: varchar("author_name", { length: 100 }).notNull().default("Certxa Team"),
  coverColor: varchar("cover_color", { length: 20 }).notNull().default("#7c3aed"),
  coverEmoji: varchar("cover_emoji", { length: 10 }).notNull().default("📝"),
  readTime: varchar("read_time", { length: 20 }).notNull().default("5 min read"),
  isFeatured: boolean("is_featured").notNull().default(false),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("blog_posts_slug_idx").on(t.slug),
  index("blog_posts_status_idx").on(t.status),
]);

// ─── site_assets ─────────────────────────────────────────────────────────────
// Admin-managed R2 assets (hero images, logos, etc.) keyed by a slug.
// Table is created at API startup by initSiteAssetsTable().
export const siteAssets = pgTable("site_assets", {
  key: text("key").primaryKey().notNull(),
  label: text("label").notNull().default(""),
  r2Url: text("r2_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
