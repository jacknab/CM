import {
  pgTable, serial, text, integer, boolean, timestamp, decimal,
  index, jsonb, date
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { locations, staff } from "../schema";

// ─── Commission Structures ────────────────────────────────────────────────────
// Named split templates (e.g. "60/40 Employee Split") that can be assigned to
// staff and contractors instead of a flat rate.

export const commissionStructures = pgTable("commission_structures", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  name:             text("name").notNull(),
  description:      text("description"),
  employeePercent:  decimal("employee_percent", { precision: 5, scale: 2 }).notNull(),
  housePercent:     decimal("house_percent",    { precision: 5, scale: 2 }).notNull(),
  appliesTo:        text("applies_to").default("both"),  // employee | contractor | both
  isDefault:        boolean("is_default").default(false),
  isActive:         boolean("is_active").default(true),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cs_store_id").on(t.storeId),
]);

export const insertCommissionStructureSchema = createInsertSchema(commissionStructures).omit({ id: true, createdAt: true, updatedAt: true });
export type CommissionStructure       = typeof commissionStructures.$inferSelect;
export type InsertCommissionStructure = z.infer<typeof insertCommissionStructureSchema>;

// ─── Contractors ──────────────────────────────────────────────────────────────
// Independent contractors (booth renters, commission stylists, etc.) per store.
// Optionally linked to an existing staff record.

export const contractors = pgTable("contractors", {
  id:                  serial("id").primaryKey(),
  storeId:             integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  staffId:             integer("staff_id").references(() => staff.id),
  name:                text("name").notNull().default(""),
  firstName:           text("first_name").notNull(),
  lastName:            text("last_name").notNull(),
  email:               text("email"),
  phone:               text("phone"),
  profileImage:        text("profile_image"),
  role:                text("role").default("stylist"),
  commissionRate:      decimal("commission_rate", { precision: 5, scale: 2 }).default("0"),
  commissionStructureId: integer("commission_structure_id").references(() => commissionStructures.id),
  productCommissionRate: decimal("product_commission_rate", { precision: 5, scale: 2 }).default("0"),
  payoutMethod:        text("payout_method").default("ach"),   // ach | instant | check
  taxClassification:   text("tax_classification").default("individual"),
  taxIdLast4:          text("tax_id_last4"),
  stripeAccountId:     text("stripe_account_id"),
  accountType:         text("account_type").default("custom"),      // express (legacy) | custom
  country:             text("country").default("US"),
  requirementsDue:     jsonb("requirements_due").$type<string[] | null>(),
  stripeTosAcceptedAt: timestamp("stripe_tos_accepted_at"),
  onboardingStatus:    text("onboarding_status").default("pending"), // pending | in_progress | complete | restricted
  bankVerified:        boolean("bank_verified").default(false),
  isActive:            boolean("is_active").default(true),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_contractors_store_id").on(t.storeId),
  index("idx_contractors_staff_id").on(t.staffId),
]);

export const insertContractorSchema = createInsertSchema(contractors).omit({ id: true, createdAt: true, updatedAt: true });
export type Contractor       = typeof contractors.$inferSelect;
export type InsertContractor = z.infer<typeof insertContractorSchema>;

// ─── Contractor Bank Accounts ─────────────────────────────────────────────────

export const contractorBankAccounts = pgTable("contractor_bank_accounts", {
  id:                      serial("id").primaryKey(),
  contractorId:            integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  accountType:             text("account_type").default("checking"),   // checking | savings
  accountHolderType:       text("account_holder_type"),                // individual | company
  accountHolderName:       text("account_holder_name"),
  bankName:                text("bank_name"),
  routingLast4:            text("routing_last4"),
  accountLast4:            text("account_last4"),
  stripeBankAccountToken:  text("stripe_bank_account_token"),
  stripeExternalAccountId: text("stripe_external_account_id"),          // ba_… once attached to the Stripe account
  verificationStatus:      text("verification_status").default("pending"), // pending | verified | failed
  isDefault:               boolean("is_default").default(true),
  createdAt:               timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cba_contractor_id").on(t.contractorId),
]);

export const insertContractorBankAccountSchema = createInsertSchema(contractorBankAccounts).omit({ id: true, createdAt: true });
export type ContractorBankAccount       = typeof contractorBankAccounts.$inferSelect;
export type InsertContractorBankAccount = z.infer<typeof insertContractorBankAccountSchema>;

// ─── Payout Deduction Rules ───────────────────────────────────────────────────
// Per-store configurable deductions (booth rent, processing fees, etc.)

export const payoutDeductionRules = pgTable("payout_deduction_rules", {
  id:            serial("id").primaryKey(),
  storeId:       integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  contractorId:  integer("contractor_id").references(() => contractors.id),
  name:          text("name").notNull(),
  type:          text("type").default("fixed"),        // fixed | percentage
  amount:        decimal("amount", { precision: 10, scale: 2 }).default("0"),
  appliesTo:     text("applies_to").default("all"),    // all | specific
  isActive:      boolean("is_active").default(true),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pdr_store_id").on(t.storeId),
]);

export const insertPayoutDeductionRuleSchema = createInsertSchema(payoutDeductionRules).omit({ id: true, createdAt: true });
export type PayoutDeductionRule       = typeof payoutDeductionRules.$inferSelect;
export type InsertPayoutDeductionRule = z.infer<typeof insertPayoutDeductionRuleSchema>;

// ─── Payout Runs ──────────────────────────────────────────────────────────────
// A complete payout batch for a pay period across multiple contractors.

export const payoutRuns = pgTable("payout_runs", {
  id:                serial("id").primaryKey(),
  storeId:           integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  periodStart:       text("period_start").notNull(),
  periodEnd:         text("period_end").notNull(),
  status:            text("status").default("draft").notNull(), // draft | pending | processing | completed | failed | cancelled
  totalGross:        decimal("total_gross", { precision: 12, scale: 2 }).default("0").notNull(),
  totalDeductions:   decimal("total_deductions", { precision: 12, scale: 2 }).default("0").notNull(),
  totalNet:          decimal("total_net", { precision: 12, scale: 2 }).default("0").notNull(),
  contractorCount:   integer("contractor_count").default(0).notNull(),
  notes:             text("notes"),
  autoGenerated:     boolean("auto_generated").default(false).notNull(),
  autoApproveAfter:  timestamp("auto_approve_after"),
  createdByUserId:   text("created_by_user_id"),
  approvedByUserId:  text("approved_by_user_id"),
  approvedAt:        timestamp("approved_at"),
  completedAt:       timestamp("completed_at"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
  updatedAt:         timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pr_store_status").on(t.storeId, t.status),
  index("idx_pr_store_created").on(t.storeId, t.createdAt),
]);

export const insertPayoutRunSchema = createInsertSchema(payoutRuns).omit({ id: true, createdAt: true, updatedAt: true });
export type PayoutRun       = typeof payoutRuns.$inferSelect;
export type InsertPayoutRun = z.infer<typeof insertPayoutRunSchema>;

// ─── Payout Run Items ─────────────────────────────────────────────────────────
// Per-contractor line item within a payout run.

export const payoutRunItems = pgTable("payout_run_items", {
  id:                serial("id").primaryKey(),
  payoutRunId:       integer("payout_run_id").references(() => payoutRuns.id, { onDelete: "cascade" }).notNull(),
  contractorId:      integer("contractor_id").references(() => contractors.id).notNull(),
  contractorName:    text("contractor_name").notNull().default(""),
  appointmentCount:  integer("appointment_count").default(0).notNull(),
  serviceRevenue:    decimal("service_revenue", { precision: 10, scale: 2 }).default("0").notNull(),
  productRevenue:    decimal("product_revenue", { precision: 10, scale: 2 }).default("0").notNull(),
  tips:              decimal("tips", { precision: 10, scale: 2 }).default("0").notNull(),
  grossAmount:       decimal("gross_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  deductions:        jsonb("deductions").$type<Array<{ name: string; amount: string; type: string }>>(),
  totalDeductions:   decimal("total_deductions", { precision: 10, scale: 2 }).default("0").notNull(),
  netAmount:         decimal("net_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  payoutMethod:      text("payout_method"),
  status:            text("status").default("pending").notNull(), // pending | processing | paid | failed | skipped
  failureReason:     text("failure_reason"),
  checkNumber:       integer("check_number"),
  stripeTransferId:  text("stripe_transfer_id"),
  paidAt:            timestamp("paid_at"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pri_run_id").on(t.payoutRunId),
  index("idx_pri_contractor_id").on(t.contractorId),
]);

export const insertPayoutRunItemSchema = createInsertSchema(payoutRunItems).omit({ id: true, createdAt: true });
export type PayoutRunItem       = typeof payoutRunItems.$inferSelect;
export type InsertPayoutRunItem = z.infer<typeof insertPayoutRunItemSchema>;

// ─── Payout Checks ────────────────────────────────────────────────────────────

export const payoutChecks = pgTable("payout_checks", {
  id:                serial("id").primaryKey(),
  storeId:           integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  payoutRunItemId:   integer("payout_run_item_id").references(() => payoutRunItems.id),
  contractorId:      integer("contractor_id").references(() => contractors.id).notNull(),
  checkNumber:       integer("check_number").notNull(),
  amount:            decimal("amount", { precision: 10, scale: 2 }).notNull(),
  payeeName:         text("payee_name").notNull(),
  memo:              text("memo"),
  periodStart:       text("period_start"),
  periodEnd:         text("period_end"),
  printStatus:       text("print_status").default("queued"),       // queued | printed | reprinted
  voidStatus:        text("void_status").default("active"),        // active | voided
  clearedStatus:     text("cleared_status").default("outstanding"), // outstanding | cleared
  issuedAt:          timestamp("issued_at").defaultNow().notNull(),
  printedAt:         timestamp("printed_at"),
  voidedAt:          timestamp("voided_at"),
  clearedAt:         timestamp("cleared_at"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pc_store_id").on(t.storeId),
  index("idx_pc_contractor_id").on(t.contractorId),
]);

export const insertPayoutCheckSchema = createInsertSchema(payoutChecks).omit({ id: true, createdAt: true, issuedAt: true });
export type PayoutCheck       = typeof payoutChecks.$inferSelect;
export type InsertPayoutCheck = z.infer<typeof insertPayoutCheckSchema>;

// ─── W9 Records ───────────────────────────────────────────────────────────────

export const payoutW9Records = pgTable("payout_w9_records", {
  id:                 serial("id").primaryKey(),
  contractorId:       integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  legalName:          text("legal_name").notNull(),
  businessName:       text("business_name"),
  taxClassification:  text("tax_classification").notNull(),
  taxIdLast4:         text("tax_id_last4"),
  address:            text("address"),
  city:               text("city"),
  state:              text("state"),
  zip:                text("zip"),
  year:               integer("year").notNull(),
  certifiedAt:        timestamp("certified_at"),
  createdAt:          timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_w9_contractor_id").on(t.contractorId),
]);

export const insertPayoutW9RecordSchema = createInsertSchema(payoutW9Records).omit({ id: true, createdAt: true });
export type PayoutW9Record       = typeof payoutW9Records.$inferSelect;
export type InsertPayoutW9Record = z.infer<typeof insertPayoutW9RecordSchema>;

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const payoutAuditLogs = pgTable("payout_audit_logs", {
  id:          serial("id").primaryKey(),
  storeId:     integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  action:      text("action").notNull(),
  entityType:  text("entity_type"),
  entityId:    integer("entity_id"),
  userId:      text("user_id"),
  userEmail:   text("user_email"),
  metadata:    jsonb("metadata"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_pal_store_id").on(t.storeId),
  index("idx_pal_created_at").on(t.createdAt),
]);

export const insertPayoutAuditLogSchema = createInsertSchema(payoutAuditLogs).omit({ id: true, createdAt: true });
export type PayoutAuditLog       = typeof payoutAuditLogs.$inferSelect;
export type InsertPayoutAuditLog = z.infer<typeof insertPayoutAuditLogSchema>;

// ─── Manual Adjustments ───────────────────────────────────────────────────────
// Manually-created ledger entries (booth rent credits, corrections, etc.)

export const payoutAdjustments = pgTable("payout_adjustments", {
  id:           serial("id").primaryKey(),
  storeId:      integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  contractorId: integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  amount:       decimal("amount", { precision: 10, scale: 2 }).notNull(),
  category:     text("category").notNull().default("Manual Adjustment"),
  description:  text("description").notNull(),
  date:         text("date").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  createdBy:    text("created_by"),
}, (t) => [
  index("idx_pay_adj_store_id").on(t.storeId),
  index("idx_pay_adj_contractor_id").on(t.contractorId),
]);

export const insertPayoutAdjustmentSchema = createInsertSchema(payoutAdjustments).omit({ id: true, createdAt: true });
export type PayoutAdjustment       = typeof payoutAdjustments.$inferSelect;
export type InsertPayoutAdjustment = z.infer<typeof insertPayoutAdjustmentSchema>;

// ─── Contractor Onboarding Tokens ─────────────────────────────────────────────
// Short-lived magic tokens that let contractors self-service their Stripe onboarding
// without an owner session. Generated by the owner; sent via email.

export const contractorOnboardingTokens = pgTable("contractor_onboarding_tokens", {
  id:           serial("id").primaryKey(),
  contractorId: integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  storeId:      integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  token:        text("token").notNull().unique(),
  expiresAt:    timestamp("expires_at").notNull(),
  usedAt:       timestamp("used_at"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cot_token").on(t.token),
  index("idx_cot_contractor_id").on(t.contractorId),
]);

export type ContractorOnboardingToken = typeof contractorOnboardingTokens.$inferSelect;

// ─── Contractor Instant Transfers ─────────────────────────────────────────────
// One record per real-time Stripe transfer fired immediately after a Terminal
// payment is captured (Uber-like: contractor cut lands in their account the
// moment the client pays).

export const contractorInstantTransfers = pgTable("contractor_instant_transfers", {
  id:                  serial("id").primaryKey(),
  contractorId:        integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  storeId:             integer("store_id").notNull(),
  appointmentId:       integer("appointment_id"),
  paymentIntentId:     text("payment_intent_id"),
  stripeTransferId:    text("stripe_transfer_id"),
  amountCents:         integer("amount_cents").notNull(),
  commissionRate:      decimal("commission_rate", { precision: 5, scale: 4 }),
  serviceAmountCents:  integer("service_amount_cents").notNull(),
  status:              text("status").notNull().default("pending"),  // pending | succeeded | failed | skipped
  failureReason:       text("failure_reason"),
  createdAt:           timestamp("created_at").defaultNow().notNull(),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_cit_contractor_id").on(t.contractorId),
  index("idx_cit_appointment_id").on(t.appointmentId),
  index("idx_cit_store_id").on(t.storeId),
]);

export const insertContractorInstantTransferSchema = createInsertSchema(contractorInstantTransfers).omit({ id: true, createdAt: true, updatedAt: true });
export type ContractorInstantTransfer       = typeof contractorInstantTransfers.$inferSelect;
export type InsertContractorInstantTransfer = z.infer<typeof insertContractorInstantTransferSchema>;

// ─── Account Corporate Addresses ──────────────────────────────────────────────
// One corporate office mailing address per user account (across all stores).
// Used as the return address on payroll batch mailer sheets.

export const accountCorporateAddresses = pgTable("account_corporate_addresses", {
  id:         serial("id").primaryKey(),
  userId:     text("user_id").notNull().unique(),
  officeName: text("office_name"),
  address1:   text("address1"),
  address2:   text("address2"),
  city:       text("city"),
  state:      text("state"),
  zip:        text("zip"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
});

export const insertAccountCorporateAddressSchema = createInsertSchema(accountCorporateAddresses).omit({ id: true, createdAt: true, updatedAt: true });
export type AccountCorporateAddress       = typeof accountCorporateAddresses.$inferSelect;
export type InsertAccountCorporateAddress = z.infer<typeof insertAccountCorporateAddressSchema>;

// ─── Payroll Print Batches ────────────────────────────────────────────────────
// Audit trail for every "Print Payroll Batch" action.

export const payrollPrintBatches = pgTable("payroll_print_batches", {
  id:            serial("id").primaryKey(),
  storeId:       integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  batchId:       text("batch_id").notNull().unique(),
  userId:        text("user_id"),
  payoutRunId:   integer("payout_run_id"),
  periodStart:   text("period_start"),
  periodEnd:     text("period_end"),
  checkCount:    integer("check_count").default(0).notNull(),
  totalAmount:   decimal("total_amount", { precision: 12, scale: 2 }).default("0").notNull(),
  envelopeType:  text("envelope_type").default("window10").notNull(),
  checksData:    jsonb("checks_data").$type<Array<{ checkNumber: string; payeeName: string; amount: number }>>(),
  mailerPrinted: boolean("mailer_printed").default(false).notNull(),
  printedAt:     timestamp("printed_at").defaultNow().notNull(),
  reprintedAt:   timestamp("reprinted_at"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_ppb_store_id").on(t.storeId),
  index("idx_ppb_batch_id").on(t.batchId),
]);

export const insertPayrollPrintBatchSchema = createInsertSchema(payrollPrintBatches).omit({ id: true, createdAt: true, printedAt: true });
export type PayrollPrintBatch       = typeof payrollPrintBatches.$inferSelect;
export type InsertPayrollPrintBatch = z.infer<typeof insertPayrollPrintBatchSchema>;

// ─── Contractor Commission Reserves ──────────────────────────────────────────
// Tracks pending contractor commissions so salon owners only see funds that are
// truly available for withdrawal (Stripe balance − reserved commissions).

export const contractorCommissions = pgTable("contractor_commissions", {
  id:                  serial("id").primaryKey(),
  storeId:             integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  contractorId:        integer("contractor_id").references(() => contractors.id, { onDelete: "cascade" }).notNull(),
  appointmentId:       integer("appointment_id"),
  serviceId:           integer("service_id"),
  amount:              integer("amount").notNull(),                        // cents
  status:              text("status").notNull().default("pending"),        // pending|paid|failed|cancelled
  earnedDate:          date("earned_date").notNull(),
  scheduledPayoutDate: date("scheduled_payout_date").notNull(),
  paidDate:            timestamp("paid_date", { withTimezone: true }),
  stripePayoutId:      text("stripe_payout_id"),
  stripeTransferId:    text("stripe_transfer_id"),
  // Set once this accrual row is swept into a payout run (see lib/commissionAccrual.ts).
  payoutRunItemId:     integer("payout_run_item_id").references(() => payoutRunItems.id),
  notes:               text("notes"),
  createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("cc_store_status_idx").on(t.storeId, t.status),
  index("cc_contractor_idx").on(t.contractorId),
  index("cc_scheduled_payout_idx").on(t.scheduledPayoutDate, t.status),
  index("cc_appointment_idx").on(t.appointmentId),
]);

export const insertContractorCommissionSchema = createInsertSchema(contractorCommissions).omit({ id: true, createdAt: true, updatedAt: true });
export type ContractorCommission       = typeof contractorCommissions.$inferSelect;
export type InsertContractorCommission = z.infer<typeof insertContractorCommissionSchema>;

// ─── Staff (W-2 employee) Commission Accrual ──────────────────────────────────
// Same idea as contractorCommissions but for plain employees paid through the
// legacy payrollRuns/payrollRunItems tracking system (defined in ../schema.ts —
// referenced here only by a plain integer column to avoid a circular import).
export const staffCommissionAccruals = pgTable("staff_commission_accruals", {
  id:               serial("id").primaryKey(),
  storeId:          integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  staffId:          integer("staff_id").notNull(),
  appointmentId:    integer("appointment_id"),
  serviceId:        integer("service_id"),
  amount:           integer("amount").notNull(),                    // cents
  status:           text("status").notNull().default("pending"),    // pending | included_in_run | paid | cancelled
  earnedDate:       date("earned_date").notNull(),
  payrollRunItemId: integer("payroll_run_item_id"),                 // set once swept into a payrollRunItems row
  notes:            text("notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("sca_store_status_idx").on(t.storeId, t.status),
  index("sca_staff_idx").on(t.staffId),
  index("sca_earned_date_idx").on(t.earnedDate, t.status),
]);

export const insertStaffCommissionAccrualSchema = createInsertSchema(staffCommissionAccruals).omit({ id: true, createdAt: true, updatedAt: true });
export type StaffCommissionAccrual       = typeof staffCommissionAccruals.$inferSelect;
export type InsertStaffCommissionAccrual = z.infer<typeof insertStaffCommissionAccrualSchema>;

// ─── Relations ────────────────────────────────────────────────────────────────

export const contractorsRelations = relations(contractors, ({ one, many }) => ({
  store:        one(locations, { fields: [contractors.storeId], references: [locations.id] }),
  staff:        one(staff,     { fields: [contractors.staffId], references: [staff.id] }),
  bankAccounts: many(contractorBankAccounts),
  payoutItems:  many(payoutRunItems),
  checks:       many(payoutChecks),
  w9Records:    many(payoutW9Records),
}));

export const payoutRunsRelations = relations(payoutRuns, ({ one, many }) => ({
  store: one(locations, { fields: [payoutRuns.storeId], references: [locations.id] }),
  items: many(payoutRunItems),
}));

export const payoutRunItemsRelations = relations(payoutRunItems, ({ one }) => ({
  run:        one(payoutRuns,  { fields: [payoutRunItems.payoutRunId],  references: [payoutRuns.id] }),
  contractor: one(contractors, { fields: [payoutRunItems.contractorId], references: [contractors.id] }),
}));
