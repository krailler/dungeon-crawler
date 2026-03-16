import {
  pgSchema,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { Role } from "@dungeon/shared";

// ── Schemas ─────────────────────────────────────────────────────────────────

export const charactersSchema = pgSchema("characters");
export const worldSchema = pgSchema("world");

// ── Characters schema (player data — backups) ───────────────────────────────

export const accounts = charactersSchema.table("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default(Role.USER),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = charactersSchema.table(
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
    statPoints: integer("stat_points").notNull().default(0),
    tutorialsCompleted: text("tutorials_completed").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_characters_account_name").on(table.accountId, table.name)],
);

export const characterInventory = charactersSchema.table(
  "character_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_char_inventory_slot").on(table.characterId, table.slotIndex),
    index("idx_char_inventory_char").on(table.characterId),
  ],
);

// ── World schema (game definitions — regenerable) ───────────────────────────

export const items = worldSchema.table("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull(),
  maxStack: integer("max_stack").notNull().default(1),
  consumable: boolean("consumable").notNull().default(false),
  cooldown: real("cooldown").notNull().default(0),
  effectType: text("effect_type").notNull().default(""),
  effectParams: jsonb("effect_params").notNull().default({}),
  dropWeight: real("drop_weight").notNull().default(0),
});
