import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Proxy table references to avoid circular imports with shared/schema.ts
const _locations = pgTable("locations", { id: serial("id").primaryKey() });
const _users = pgTable("users", { id: varchar("id").primaryKey() });
const _staff = pgTable("staff", { id: serial("id").primaryKey() });

// ─── clients ──────────────────────────────────────────────────────────────────
export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    fullName: text("full_name").notNull().default(""),
    preferredName: text("preferred_name"),
    dateOfBirth: text("date_of_birth"),
    allergies: text("allergies"),
    gender: text("gender"),
    preferredStaffId: integer("preferred_staff_id").references(() => _staff.id),
    clientStatus: text("client_status").notNull().default("active"),
    source: text("source").default("manual"),
    referralSource: text("referral_source"),
    avatarUrl: text("avatar_url"),
    totalVisits: integer("total_visits").notNull().default(0),
    totalSpentCents: integer("total_spent_cents").notNull().default(0),
    lastVisitAt: timestamp("last_visit_at"),
    nextAppointmentAt: timestamp("next_appointment_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    // ── Stripe card-on-file (per salon — stored via booking payment policy) ──
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    cardExpMonth: integer("card_exp_month"),
    cardExpYear: integer("card_exp_year"),
  },
  (t) => [
    index("clients_store_id_idx").on(t.storeId),
    index("clients_full_name_idx").on(t.fullName),
    index("clients_status_idx").on(t.clientStatus),
    index("clients_last_visit_idx").on(t.lastVisitAt),
  ]
);

// ─── client_emails ────────────────────────────────────────────────────────────
export const clientEmails = pgTable(
  "client_emails",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    emailAddress: text("email_address").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verified: boolean("verified").notNull().default(false),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_emails_client_id_idx").on(t.clientId),
    index("client_emails_address_idx").on(t.emailAddress),
  ]
);

// ─── client_phones ────────────────────────────────────────────────────────────
export const clientPhones = pgTable(
  "client_phones",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id").references(() => _locations.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    phoneNumberE164: text("phone_number_e164").notNull(),
    displayPhone: text("display_phone"),
    phoneType: text("phone_type").notNull().default("mobile"),
    smsOptIn: boolean("sms_opt_in").notNull().default(true),
    verified: boolean("verified").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_phones_client_id_idx").on(t.clientId),
    index("client_phones_e164_idx").on(t.phoneNumberE164),
  ]
);

// ─── client_addresses ─────────────────────────────────────────────────────────
export const clientAddresses = pgTable(
  "client_addresses",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").default("US"),
    addressType: text("address_type").notNull().default("home"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("client_addresses_client_id_idx").on(t.clientId)]
);

// ─── client_tags ──────────────────────────────────────────────────────────────
export const clientTags = pgTable(
  "client_tags",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    tagName: text("tag_name").notNull(),
    tagColor: text("tag_color").notNull().default("#6366f1"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_tags_store_id_idx").on(t.storeId),
    uniqueIndex("client_tags_store_name_uidx").on(t.storeId, t.tagName),
  ]
);

// ─── client_tag_relationships ─────────────────────────────────────────────────
export const clientTagRelationships = pgTable(
  "client_tag_relationships",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    tagId: integer("tag_id")
      .references(() => clientTags.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_tag_rel_client_idx").on(t.clientId),
    index("client_tag_rel_tag_idx").on(t.tagId),
    uniqueIndex("client_tag_rel_uidx").on(t.clientId, t.tagId),
  ]
);

// ─── client_notes ─────────────────────────────────────────────────────────────
export const clientNotes = pgTable(
  "client_notes",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    createdByUserId: text("created_by_user_id").references(() => _users.id),
    noteType: text("note_type").notNull().default("general"),
    visibility: text("visibility").notNull().default("internal"),
    noteContent: text("note_content").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_notes_client_id_idx").on(t.clientId),
    index("client_notes_store_id_idx").on(t.storeId),
    index("client_notes_pinned_idx").on(t.pinned),
  ]
);

// ─── client_marketing_preferences ────────────────────────────────────────────
export const clientMarketingPreferences = pgTable(
  "client_marketing_preferences",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    smsMarketingOptIn: boolean("sms_marketing_opt_in").notNull().default(true),
    emailMarketingOptIn: boolean("email_marketing_opt_in").notNull().default(true),
    promotionalNotifications: boolean("promotional_notifications").notNull().default(true),
    appointmentReminders: boolean("appointment_reminders").notNull().default(true),
    birthdayMessages: boolean("birthday_messages").notNull().default(true),
    reviewRequests: boolean("review_requests").notNull().default(true),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("client_mkt_prefs_client_idx").on(t.clientId)]
);

// ─── client_custom_fields ─────────────────────────────────────────────────────
export const clientCustomFields = pgTable(
  "client_custom_fields",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    fieldName: text("field_name").notNull(),
    fieldType: text("field_type").notNull().default("text"),
    fieldOptionsJson: jsonb("field_options_json"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("client_custom_fields_store_idx").on(t.storeId)]
);

// ─── client_custom_field_values ───────────────────────────────────────────────
export const clientCustomFieldValues = pgTable(
  "client_custom_field_values",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    customFieldId: integer("custom_field_id")
      .references(() => clientCustomFields.id, { onDelete: "cascade" })
      .notNull(),
    fieldValue: text("field_value"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_cfv_client_idx").on(t.clientId),
    uniqueIndex("client_cfv_uidx").on(t.clientId, t.customFieldId),
  ]
);

// ─── client_audit_logs ────────────────────────────────────────────────────────
export const clientAuditLogs = pgTable(
  "client_audit_logs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    actionType: text("action_type").notNull(),
    actorUserId: text("actor_user_id").references(() => _users.id),
    metadataJson: jsonb("metadata_json"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("client_audit_client_idx").on(t.clientId),
    index("client_audit_store_idx").on(t.storeId),
    index("client_audit_action_idx").on(t.actionType),
    index("client_audit_created_idx").on(t.createdAt),
  ]
);

// ─── client_export_jobs ───────────────────────────────────────────────────────
export const clientExportJobs = pgTable(
  "client_export_jobs",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => _users.id),
    format: text("format").notNull().default("csv"),
    status: text("status").notNull().default("pending"),
    filterJson: jsonb("filter_json"),
    totalRows: integer("total_rows"),
    downloadUrl: text("download_url"),
    errorMessage: text("error_message"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("client_export_jobs_store_idx").on(t.storeId),
    index("client_export_jobs_status_idx").on(t.status),
  ]
);

// ─── client_import_jobs ───────────────────────────────────────────────────────
export const clientImportJobs = pgTable(
  "client_import_jobs",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .references(() => _locations.id)
      .notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => _users.id),
    status: text("status").notNull().default("pending"),
    fileName: text("file_name"),
    totalRows: integer("total_rows").default(0),
    importedRows: integer("imported_rows").default(0),
    skippedRows: integer("skipped_rows").default(0),
    errorRows: integer("error_rows").default(0),
    duplicatesFound: integer("duplicates_found").default(0),
    previewJson: jsonb("preview_json"),
    errorsJson: jsonb("errors_json"),
    fieldMappingJson: jsonb("field_mapping_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("client_import_jobs_store_idx").on(t.storeId),
    index("client_import_jobs_status_idx").on(t.status),
  ]
);

// ─── Zod schemas ──────────────────────────────────────────────────────────────
export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertClientEmailSchema = createInsertSchema(clientEmails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertClientPhoneSchema = createInsertSchema(clientPhones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertClientAddressSchema = createInsertSchema(clientAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertClientTagSchema = createInsertSchema(clientTags).omit({
  id: true,
  createdAt: true,
});
export const insertClientNoteSchema = createInsertSchema(clientNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type ClientEmail = typeof clientEmails.$inferSelect;
export type ClientPhone = typeof clientPhones.$inferSelect;
export type ClientAddress = typeof clientAddresses.$inferSelect;
export type ClientTag = typeof clientTags.$inferSelect;
export type ClientTagRelationship = typeof clientTagRelationships.$inferSelect;
export type ClientNote = typeof clientNotes.$inferSelect;
export type ClientMarketingPreferences = typeof clientMarketingPreferences.$inferSelect;
export type ClientCustomField = typeof clientCustomFields.$inferSelect;
export type ClientCustomFieldValue = typeof clientCustomFieldValues.$inferSelect;
export type ClientAuditLog = typeof clientAuditLogs.$inferSelect;
export type ClientExportJob = typeof clientExportJobs.$inferSelect;
export type ClientImportJob = typeof clientImportJobs.$inferSelect;

export type ClientWithDetails = Client & {
  emails: ClientEmail[];
  phones: ClientPhone[];
  addresses: ClientAddress[];
  tags: (ClientTagRelationship & { tag: ClientTag })[];
  notes: ClientNote[];
  marketingPreferences: ClientMarketingPreferences | null;
};
