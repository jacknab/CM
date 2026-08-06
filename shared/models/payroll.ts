import { pgTable, serial, integer, timestamp, numeric, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Payroll run represents a period for which payroll is calculated
export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").$default(() => "draft"), // draft | finalized
  createdAt: timestamp("created_at").defaultNow(),
  finalizedAt: timestamp("finalized_at"),
});

// Individual payroll items (commissions, tips, wages, etc.)
export const payrollRunItems = pgTable("payroll_run_items", {
  id: serial("id").primaryKey(),
  payrollRunId: integer("payroll_run_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: text("type").notNull(), // e.g., "wage", "tip", "commission"
  createdAt: timestamp("created_at").defaultNow(),
});

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
export type PayrollRunItem = typeof payrollRunItems.$inferSelect;
export type NewPayrollRunItem = typeof payrollRunItems.$inferInsert;

