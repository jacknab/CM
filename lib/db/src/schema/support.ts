import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const supportAgents = pgTable("support_agents", {
  id:           serial("id").primaryKey(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName:    text("first_name").notNull(),
  lastName:     text("last_name").notNull(),
  role:         text("role").notNull().default("agent"),
  isActive:     boolean("is_active").notNull().default(true),
  lastLoginAt:  timestamp("last_login_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const supportAgentActivity = pgTable("support_agent_activity", {
  id:        serial("id").primaryKey(),
  agentId:   integer("agent_id").references(() => supportAgents.id),
  accountId: integer("account_id"),
  action:    text("action").notNull(),
  details:   text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportAgent = typeof supportAgents.$inferSelect;
export type SupportAgentActivity = typeof supportAgentActivity.$inferSelect;
