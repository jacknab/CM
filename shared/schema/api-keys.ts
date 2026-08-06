import {
  pgTable, serial, text, integer, boolean, timestamp, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { locations } from "../schema";

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => locations.id).notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").default("read"),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("idx_api_keys_store_id").on(t.storeId),
  index("idx_api_keys_hash").on(t.keyHash),
]);

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  store: one(locations, { fields: [apiKeys.storeId], references: [locations.id] }),
}));
