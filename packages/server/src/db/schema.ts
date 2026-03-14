import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    name: text("name").notNull(),
    strength: integer("strength").notNull().default(10),
    vitality: integer("vitality").notNull().default(10),
    agility: integer("agility").notNull().default(10),
    level: integer("level").notNull().default(1),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [uniqueIndex("idx_characters_account_name").on(table.accountId, table.name)],
);
