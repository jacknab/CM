import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templatesTable = pgTable("wb_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  filesPath: text("files_path").notNull(),
  buildStatus: text("build_status"),
  buildError: text("build_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({ id: true, createdAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
