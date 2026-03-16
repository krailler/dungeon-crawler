import { pgTable, text, integer, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { Role } from "@dungeon/shared";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default(Role.USER),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    strength: integer("strength").notNull().default(10),
    vitality: integer("vitality").notNull().default(10),
    agility: integer("agility").notNull().default(10),
    level: integer("level").notNull().default(1),
    gold: integer("gold").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    tutorialsCompleted: text("tutorials_completed").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_characters_account_name").on(table.accountId, table.name)],
);
