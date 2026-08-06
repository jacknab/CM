import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const imageLibraryTable = pgTable("wb_image_library", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  category: text("category").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImageLibraryItem = typeof imageLibraryTable.$inferSelect;
