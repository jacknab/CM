import {
  pgTable, serial, text, integer, decimal, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { locations } from "../schema";
import { users } from "../models/auth";
import type { SocialLink } from "../rentalProfessionals";

// =============================================================================
// CERTXA RENTALS — DOMAIN FOUNDATION (Phase 1)
// -----------------------------------------------------------------------------
// A separate product for facility owners who rent spaces to independent
// beauty professionals (booth/suite rental), distinct from the Certxa Salon
// employee/commission model. A "facility" IS a `locations` row — Rentals
// reuses the existing tenant unit rather than introducing a second
// organization concept (see Rentals Phase 0 audit).
//
// Deliberately deferred to a later phase: rent charges/payments, invoicing,
// autopay, late fees, maintenance requests, documents, announcements,
// applications, shared resources/reservations. Only the minimal domain
// skeleton (Space, Professional, Agreement) is established here.
// =============================================================================

// ─── Spaces ─────────────────────────────────────────────────────────────────
// The core physical rentable asset. Deliberately one model for suite/booth/
// room rather than separate "Chair" and "Booth" tables — `type` distinguishes
// them.

export const rentalSpaces = pgTable("rental_spaces", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(), // e.g. "Suite 4", "Booth B"
  type: text("type").notNull().default("suite"), // suite | booth | treatment_room | other
  status: text("status").notNull().default("available"), // available | occupied | reserved | maintenance | inactive
  monthlyRate: decimal("monthly_rate", { precision: 10, scale: 2 }),
  baseRatePeriodDays: integer("base_rate_period_days").notNull().default(30),
  // Public-ish summary of the space itself (Phase 2). Kept distinct from `notes`,
  // which stays an owner-private field. Neither is agreement/billing data — see
  // rentalAgreements.monthlyRate for the actual contractual rent once that
  // system exists; this column is only the space's own default/base rate.
  description: text("description"),
  notes: text("notes"),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_rental_spaces_store_id").on(t.storeId),
  index("idx_rental_spaces_base_rate_period_days").on(t.baseRatePeriodDays),
]);

export const insertRentalSpaceSchema = createInsertSchema(rentalSpaces).omit({ id: true, createdAt: true, updatedAt: true });
export type RentalSpace = typeof rentalSpaces.$inferSelect;
export type InsertRentalSpace = z.infer<typeof insertRentalSpaceSchema>;

// ─── Professionals ──────────────────────────────────────────────────────────
// An independent professional renting space at a facility. Deliberately NOT
// a `staff` row and NOT linked to one — professionals are not employees, and
// must not inherit staff-table auth/commission/employment semantics. Has no
// login/session identity yet — deliberately deferred (Phase 0 audit Section F,
// reaffirmed in Phase 3): nothing in this domain yet requires a professional
// to authenticate, so there is no login surface to secure, which is itself a
// valid way to keep the owner/professional privacy boundary intact until a
// real professional-facing feature justifies building it.
//
// Deliberately NOT linked to `clients`, `appointments`, `staff`, or any other
// table holding a professional's own private Certxa business data (Phase 3
// Section 15/25/26) — the privacy boundary is structural (no such foreign key
// exists), not just an access-control check that could be forgotten.
//
// `name` is the professional's display name (shown everywhere); `firstName`/
// `lastName` are optional structured identity captured by the Add/Edit form,
// mirroring the same name/firstName/lastName convention already used by
// `contractors` (shared/schema/payouts.ts) — kept separate domains, same
// naming shape for consistency.
export const rentalProfessionals = pgTable("rental_professionals", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  businessName: text("business_name"),
  businessType: text("business_type"), // e.g. "Nail Technician", "Hair Stylist" — freeform, owner-entered
  description: text("description"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  socialLinks: jsonb("social_links").$type<SocialLink[]>().notNull().default([]),
  status: text("status").notNull().default("active"), // active | pending | inactive | former
  notes: text("notes"), // facility-owner-only, never the professional's own notes
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_rental_professionals_store_id").on(t.storeId),
]);

export const insertRentalProfessionalSchema = createInsertSchema(rentalProfessionals).omit({ id: true, createdAt: true, updatedAt: true });
export type RentalProfessional = typeof rentalProfessionals.$inferSelect;
export type InsertRentalProfessional = z.infer<typeof insertRentalProfessionalSchema>;

// ─── Agreements ─────────────────────────────────────────────────────────────
// The authoritative Professional <-> Space relationship (Phase 4). A
// Professional never permanently "owns" a Space — this table is the only
// source of truth for who currently (or previously) rents which Space, so a
// Professional can move Spaces, have multiple historical Agreements, or a
// Space can sit vacant between Agreements, without any other table needing
// to change. Still no rent-payment/invoicing fields — this is contractual
// rent terms only; Phase 5 will build charges/payments on top of this.
//
// `status` is intentionally a 2-value field (active | terminated) — only
// "terminated" is a real user action. Everything else the owner sees
// (Upcoming/Active/Ending/Ended) is derived from status + dates at read time
// via shared/rentalAgreements.ts's deriveAgreementLifecycle(), never stored,
// so a status value can never contradict the agreement's own dates.
//
// `monthlyRate` is a Phase 1 leftover, now superseded by `rentAmount` +
// `rentFrequency` (rent isn't always monthly). Left in place unused rather
// than dropped — no live data exists to migrate, but dropping a column is a
// destructive schema change this project's conventions avoid on principle.
export const rentalAgreements = pgTable("rental_agreements", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  spaceId: integer("space_id").references(() => rentalSpaces.id, { onDelete: "cascade" }).notNull(),
  professionalId: integer("professional_id").references(() => rentalProfessionals.id, { onDelete: "cascade" }).notNull(),
  status: text("status").notNull().default("active"), // active | terminated — see comment above
  /** @deprecated superseded by rentAmount + rentFrequency (Phase 4) */
  monthlyRate: decimal("monthly_rate", { precision: 10, scale: 2 }),
  rentAmount: decimal("rent_amount", { precision: 10, scale: 2 }),
  rentFrequency: text("rent_frequency").notNull().default("monthly"), // weekly | biweekly | monthly
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
  noticePeriodDays: integer("notice_period_days"),
  notes: text("notes"), // facility-owner operational notes/terms for this agreement
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"), // null = open-ended / month-to-month
  terminatedAt: timestamp("terminated_at"), // set only by the explicit Terminate action — distinct from endDate, preserves the original contracted end date
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_rental_agreements_store_id").on(t.storeId),
  index("idx_rental_agreements_space_id").on(t.spaceId),
  index("idx_rental_agreements_professional_id").on(t.professionalId),
]);

export const insertRentalAgreementSchema = createInsertSchema(rentalAgreements).omit({ id: true, createdAt: true, updatedAt: true });
export type RentalAgreement = typeof rentalAgreements.$inferSelect;
export type InsertRentalAgreement = z.infer<typeof insertRentalAgreementSchema>;

// ─── Rent Charges (Phase 5) ─────────────────────────────────────────────────
// A specific amount owed for a specific billing period, generated FROM a
// rentalAgreement — never a second place rent terms live. `amount` is a
// snapshot taken at generation time: if the Agreement's rentAmount is edited
// later, already-generated historical charges must NOT retroactively change
// (Phase 5 Section 29 — never silently change historical payment amounts).
//
// `status` is intentionally minimal (unpaid | paid | voided) — "due" /
// "overdue" / "upcoming" are derived from status + dueDate at read time
// (shared/rentCharges.ts), the same pattern as rentalAgreements' lifecycle,
// for the same reason: a stored status can't contradict its own due date.
//
// professionalId/spaceId are denormalized from the agreement for efficient
// list/filter queries (Section 6) — always kept in sync at generation time,
// never independently editable.
//
// UNIQUE(agreement_id, period_start) is the actual duplicate-prevention
// mechanism (Section 10) — charge generation is `INSERT ... ON CONFLICT DO
// NOTHING`, so running it twice (or concurrently) can never create two
// charges for the same agreement's billing period.
export const rentCharges = pgTable("rent_charges", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  agreementId: integer("agreement_id").references(() => rentalAgreements.id, { onDelete: "cascade" }).notNull(),
  professionalId: integer("professional_id").references(() => rentalProfessionals.id, { onDelete: "cascade" }).notNull(),
  spaceId: integer("space_id").references(() => rentalSpaces.id, { onDelete: "cascade" }).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  dueDate: timestamp("due_date").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("unpaid"), // unpaid | paid | voided
  voidedAt: timestamp("voided_at"),
  voidedReason: text("voided_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_rent_charges_store_id").on(t.storeId),
  index("idx_rent_charges_agreement_id").on(t.agreementId),
  index("idx_rent_charges_professional_id").on(t.professionalId),
  index("idx_rent_charges_space_id").on(t.spaceId),
  uniqueIndex("uniq_rent_charges_agreement_period").on(t.agreementId, t.periodStart),
]);

export const insertRentChargeSchema = createInsertSchema(rentCharges).omit({ id: true, createdAt: true, updatedAt: true });
export type RentCharge = typeof rentCharges.$inferSelect;
export type InsertRentCharge = z.infer<typeof insertRentChargeSchema>;

// ─── Rent Payments (Phase 5) ────────────────────────────────────────────────
// Money actually received against a specific Charge — kept as its own table
// (never collapsed into rentCharges) so a charge can be paid in more than one
// installment and the full payment history stays auditable. Manual only this
// phase (method: cash | check | other) — no Stripe integration yet; that
// decision needs a real answer on which Stripe account receives rent before
// it's safe to build (see the Phase 5 report). No raw payment credentials are
// ever stored here, consistent with never handling card data directly.
export const rentPayments = pgTable("rent_payments", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  chargeId: integer("charge_id").references(() => rentCharges.id, { onDelete: "cascade" }).notNull(),
  agreementId: integer("agreement_id").references(() => rentalAgreements.id, { onDelete: "cascade" }).notNull(),
  professionalId: integer("professional_id").references(() => rentalProfessionals.id, { onDelete: "cascade" }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: text("method").notNull(), // cash | check | other
  reference: text("reference"), // e.g. a check number — freeform
  paidAt: timestamp("paid_at").notNull(), // the date the owner says the money was actually received, not necessarily "now"
  recordedByUserId: text("recorded_by_user_id").references(() => users.id), // audit trail — who recorded this payment
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_rent_payments_store_id").on(t.storeId),
  index("idx_rent_payments_charge_id").on(t.chargeId),
]);

export const insertRentPaymentSchema = createInsertSchema(rentPayments).omit({ id: true, createdAt: true, updatedAt: true });
export type RentPayment = typeof rentPayments.$inferSelect;
export type InsertRentPayment = z.infer<typeof insertRentPaymentSchema>;
