import { pgTable, serial, integer, text, decimal, boolean, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { locations, staff } from "../schema";
import { clients } from "./clients";

export const clientIntelligence = pgTable("client_intelligence", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  customerId: integer("customer_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  avgVisitCadenceDays: decimal("avg_visit_cadence_days", { precision: 6, scale: 1 }),
  lastVisitDate: timestamp("last_visit_date"),
  nextExpectedVisitDate: timestamp("next_expected_visit_date"),
  daysSinceLastVisit: integer("days_since_last_visit"),
  daysOverduePct: decimal("days_overdue_pct", { precision: 6, scale: 1 }),
  totalVisits: integer("total_visits").default(0),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),
  avgTicketValue: decimal("avg_ticket_value", { precision: 10, scale: 2 }).default("0.00"),
  ltv12Month: decimal("ltv_12_month", { precision: 10, scale: 2 }).default("0.00"),
  ltvAllTime: decimal("ltv_all_time", { precision: 10, scale: 2 }).default("0.00"),
  ltvScore: integer("ltv_score").default(0),
  churnRiskScore: integer("churn_risk_score").default(0),
  churnRiskLabel: text("churn_risk_label").default("low"),
  noShowCount: integer("no_show_count").default(0),
  noShowRate: decimal("no_show_rate", { precision: 5, scale: 2 }).default("0.00"),
  rebookingRate: decimal("rebooking_rate", { precision: 5, scale: 2 }).default("0.00"),
  preferredStaffId: integer("preferred_staff_id").references(() => staff.id, { onDelete: "set null" }),
  preferredDayOfWeek: integer("preferred_day_of_week"),
  preferredTimeOfDay: text("preferred_time_of_day"),
  lastWinbackSentAt: timestamp("last_winback_sent_at"),
  winbackSentCount: integer("winback_sent_count").default(0),
  isDrifting: boolean("is_drifting").default(false),
  isAtRisk: boolean("is_at_risk").default(false),
  computedAt: timestamp("computed_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  storeIdIdx: index("ci_store_id_idx").on(table.storeId),
  customerIdIdx: index("ci_customer_id_idx").on(table.customerId),
  storeCustomerUdx: uniqueIndex("ci_store_customer_uidx").on(table.storeId, table.customerId),
  churnRiskIdx: index("ci_churn_risk_idx").on(table.churnRiskScore),
  isDriftingIdx: index("ci_is_drifting_idx").on(table.isDrifting),
  isAtRiskIdx: index("ci_is_at_risk_idx").on(table.isAtRisk),
}));

export const staffIntelligence = pgTable("staff_intelligence", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  staffId: integer("staff_id").references(() => staff.id, { onDelete: "cascade" }).notNull(),
  totalAppointments: integer("total_appointments").default(0),
  completedAppointments: integer("completed_appointments").default(0),
  noShowCount: integer("no_show_count").default(0),
  cancellationCount: integer("cancellation_count").default(0),
  rebookedCount: integer("rebooked_count").default(0),
  rebookingRatePct: decimal("rebooking_rate_pct", { precision: 5, scale: 2 }).default("0.00"),
  avgTicketValue: decimal("avg_ticket_value", { precision: 10, scale: 2 }).default("0.00"),
  totalRevenue: decimal("total_revenue", { precision: 10, scale: 2 }).default("0.00"),
  uniqueClientsServed: integer("unique_clients_served").default(0),
  clientRetentionRate: decimal("client_retention_rate", { precision: 5, scale: 2 }).default("0.00"),
  trend: text("trend").default("stable"),
  computedAt: timestamp("computed_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  storeIdIdx: index("si_store_id_idx").on(table.storeId),
  staffIdIdx: index("si_staff_id_idx").on(table.staffId),
  storeStaffUdx: uniqueIndex("si_store_staff_uidx").on(table.storeId, table.staffId),
}));

export const intelligenceInterventions = pgTable("intelligence_interventions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  customerId: integer("customer_id").references(() => clients.id, { onDelete: "set null" }),
  interventionType: text("intervention_type").notNull(),
  channel: text("channel").notNull().default("sms"),
  messageBody: text("message_body"),
  status: text("status").notNull().default("sent"),
  triggeredBy: text("triggered_by").notNull().default("auto"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  sentAt: timestamp("sent_at").default(sql`CURRENT_TIMESTAMP`),
  respondedAt: timestamp("responded_at"),
  convertedAt: timestamp("converted_at"),
  appointmentId: integer("appointment_id"),
}, (table) => ({
  storeIdIdx: index("ii_store_id_idx").on(table.storeId),
  customerIdIdx: index("ii_customer_id_idx").on(table.customerId),
  typeIdx: index("ii_type_idx").on(table.interventionType),
  sentAtIdx: index("ii_sent_at_idx").on(table.sentAt),
}));

export const growthScoreSnapshots = pgTable("growth_score_snapshots", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  overallScore: integer("overall_score").notNull(),
  retentionScore: integer("retention_score").notNull(),
  rebookingScore: integer("rebooking_score").notNull(),
  utilizationScore: integer("utilization_score").notNull(),
  revenueScore: integer("revenue_score").notNull(),
  newClientScore: integer("new_client_score").notNull(),
  activeClients: integer("active_clients").default(0),
  driftingClients: integer("drifting_clients").default(0),
  atRiskClients: integer("at_risk_clients").default(0),
  avgRebookingRate: decimal("avg_rebooking_rate", { precision: 5, scale: 2 }),
  seatUtilizationPct: decimal("seat_utilization_pct", { precision: 5, scale: 2 }),
  monthlyRevenue: decimal("monthly_revenue", { precision: 10, scale: 2 }),
  snapshotDate: timestamp("snapshot_date").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  storeIdIdx: index("gss_store_id_idx").on(table.storeId),
  snapshotDateIdx: index("gss_snapshot_date_idx").on(table.snapshotDate),
}));

export const deadSeatPatterns = pgTable("dead_seat_patterns", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id, { onDelete: "cascade" }).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  hourStart: integer("hour_start").notNull(),
  avgUtilizationPct: decimal("avg_utilization_pct", { precision: 5, scale: 2 }).default("0.00"),
  totalSlotsAnalyzed: integer("total_slots_analyzed").default(0),
  bookedSlots: integer("booked_slots").default(0),
  estimatedLostRevenue: decimal("estimated_lost_revenue", { precision: 10, scale: 2 }).default("0.00"),
  computedAt: timestamp("computed_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  storeIdIdx: index("dsp_store_id_idx").on(table.storeId),
  storeSlotUdx: uniqueIndex("dsp_store_slot_uidx").on(table.storeId, table.dayOfWeek, table.hourStart),
}));

export type ClientIntelligence = typeof clientIntelligence.$inferSelect;
export type StaffIntelligence = typeof staffIntelligence.$inferSelect;
export type IntelligenceIntervention = typeof intelligenceInterventions.$inferSelect;
export type GrowthScoreSnapshot = typeof growthScoreSnapshots.$inferSelect;
export type DeadSeatPattern = typeof deadSeatPatterns.$inferSelect;
