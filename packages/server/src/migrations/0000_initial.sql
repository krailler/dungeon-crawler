-- ── Schemas ──────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS "characters";
CREATE SCHEMA IF NOT EXISTS "world";

-- ── Characters schema ────────────────────────────────────────────────────────

CREATE TABLE "characters"."accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password" text NOT NULL,
  "role" text DEFAULT 'user' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "characters"."characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  "name" text NOT NULL,
  "strength" integer DEFAULT 10 NOT NULL,
  "vitality" integer DEFAULT 10 NOT NULL,
  "agility" integer DEFAULT 10 NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "gold" integer DEFAULT 0 NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "stat_points" integer DEFAULT 0 NOT NULL,
  "tutorials_completed" text DEFAULT '[]' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "characters_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "characters"."accounts"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_characters_account_name" ON "characters"."characters" ("account_id", "name");

CREATE TABLE "characters"."character_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL,
  "slot_index" integer NOT NULL,
  "item_id" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "character_inventory_character_id_characters_id_fk"
    FOREIGN KEY ("character_id") REFERENCES "characters"."characters"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_char_inventory_slot" ON "characters"."character_inventory" ("character_id", "slot_index");
CREATE INDEX "idx_char_inventory_char" ON "characters"."character_inventory" ("character_id");

-- ── World schema ─────────────────────────────────────────────────────────────

CREATE TABLE "world"."items" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text NOT NULL,
  "max_stack" integer DEFAULT 1 NOT NULL,
  "consumable" boolean DEFAULT false NOT NULL,
  "cooldown" real DEFAULT 0 NOT NULL,
  "effect_type" text DEFAULT '' NOT NULL,
  "effect_params" jsonb DEFAULT '{}' NOT NULL
);

CREATE TABLE "world"."creatures" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "strength" integer DEFAULT 10 NOT NULL,
  "vitality" integer DEFAULT 10 NOT NULL,
  "agility" integer DEFAULT 10 NOT NULL,
  "override_max_health" integer,
  "override_move_speed" real,
  "override_attack_cooldown" real,
  "override_attack_damage" integer,
  "override_defense" integer,
  "detection_range" real DEFAULT 12 NOT NULL,
  "attack_range" real DEFAULT 2.5 NOT NULL,
  "leash_range" real DEFAULT 20 NOT NULL,
  "skin" text NOT NULL,
  "min_level" integer DEFAULT 1 NOT NULL,
  "max_level" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "world"."creature_loot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL,
  "item_id" text NOT NULL,
  "drop_chance" real DEFAULT 0.25 NOT NULL,
  "min_quantity" integer DEFAULT 1 NOT NULL,
  "max_quantity" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "creature_loot_creature_id_creatures_id_fk"
    FOREIGN KEY ("creature_id") REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  CONSTRAINT "creature_loot_item_id_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "world"."items"("id") ON DELETE CASCADE
);

-- ── Seed data ────────────────────────────────────────────────────────────────

-- Health potion
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "cooldown", "effect_type", "effect_params")
VALUES ('health_potion', 'items.healthPotion', 'items.healthPotionDesc', 'potion_red', 10, true, 10, 'heal', '{"amount": 50}');

-- Zombie creature
INSERT INTO "world"."creatures" (
  "id", "name", "strength", "vitality", "agility",
  "override_max_health", "override_move_speed", "override_attack_cooldown",
  "detection_range", "attack_range", "leash_range",
  "skin", "min_level", "max_level"
) VALUES (
  'zombie', 'creatures.zombie', 6, 4, 6,
  30, 3, 1.5,
  12, 2.5, 20,
  'zombie', 1, 0
);

-- Zombie loot: health potion 80% chance
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES ('zombie', 'health_potion', 0.8, 1, 1);
