import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const portfolioSnapshots = sqliteTable("portfolio_snapshots", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  source: text("source").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
