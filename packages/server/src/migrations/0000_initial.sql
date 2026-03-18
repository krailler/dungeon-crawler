-- ── Schemas ──────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS "characters";
CREATE SCHEMA IF NOT EXISTS "world";

-- ── Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE "characters"."role" AS ENUM ('admin', 'user');
CREATE TYPE "world"."item_effect_type" AS ENUM ('none', 'heal');
CREATE TYPE "world"."stack_behavior" AS ENUM ('refresh', 'intensity');
CREATE TYPE "world"."creature_effect_trigger" AS ENUM ('on_hit');

-- ── Characters schema ────────────────────────────────────────────────────────

CREATE TABLE "characters"."accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password" text NOT NULL,
  "role" "characters"."role" DEFAULT 'user' NOT NULL,
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

CREATE TABLE "characters"."character_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "skill_id" text NOT NULL
);

CREATE UNIQUE INDEX "idx_char_skills_skill" ON "characters"."character_skills" ("character_id", "skill_id");
CREATE INDEX "idx_char_skills_char" ON "characters"."character_skills" ("character_id");

-- ── World schema ─────────────────────────────────────────────────────────────

CREATE TABLE "world"."items" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text NOT NULL,
  "max_stack" integer DEFAULT 1 NOT NULL,
  "consumable" boolean DEFAULT false NOT NULL,
  "cooldown" real DEFAULT 0 NOT NULL,
  "effect_type" "world"."item_effect_type" DEFAULT 'none' NOT NULL,
  "effect_params" jsonb DEFAULT '{}' NOT NULL,
  "use_sound" text DEFAULT '' NOT NULL
);

CREATE TABLE "world"."skills" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text NOT NULL,
  "passive" boolean DEFAULT false NOT NULL,
  "cooldown" real DEFAULT 0 NOT NULL,
  "damage_multiplier" real DEFAULT 1 NOT NULL,
  "anim_state" text DEFAULT 'punch' NOT NULL
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

CREATE TABLE "world"."effects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text NOT NULL,
  "duration" real DEFAULT 5 NOT NULL,
  "max_stacks" integer DEFAULT 1 NOT NULL,
  "stack_behavior" "world"."stack_behavior" DEFAULT 'refresh' NOT NULL,
  "is_debuff" boolean DEFAULT true NOT NULL,
  "stat_modifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tick_effect" jsonb,
  "scaling" jsonb
);

CREATE TABLE "world"."creature_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  "trigger" "world"."creature_effect_trigger" NOT NULL,
  "effect_id" text NOT NULL REFERENCES "world"."effects"("id") ON DELETE CASCADE,
  "chance" real DEFAULT 0.3 NOT NULL,
  "stacks" integer DEFAULT 1 NOT NULL,
  "min_level" integer DEFAULT 0 NOT NULL,
  "max_level" integer DEFAULT 0 NOT NULL,
  "max_chance" real,
  "scaling_override" jsonb
);

-- ── Seed data ────────────────────────────────────────────────────────────────

-- Items
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "cooldown", "effect_type", "effect_params", "use_sound")
VALUES ('health_potion', 'items.healthPotion', 'items.healthPotionDesc', 'potion_red', 10, true, 10, 'heal', '{"amount": 50}', 'potion_drink');

-- Skills
INSERT INTO "world"."skills" ("id", "name", "description", "icon", "passive", "cooldown", "damage_multiplier", "anim_state") VALUES
  ('basic_attack', 'skills.basicAttack', 'skills.basicAttackDesc', 'sword', true,  0, 1, 'punch'),
  ('heavy_strike', 'skills.heavyStrike', 'skills.heavyStrikeDesc', 'fist',  false, 5, 2.5, 'heavy_punch');

-- Creatures
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

-- Creature loot
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES ('zombie', 'health_potion', 0.8, 1, 1);

-- Effects
INSERT INTO "world"."effects" ("id", "name", "description", "icon", "duration", "max_stacks", "stack_behavior", "is_debuff", "stat_modifiers", "tick_effect", "scaling")
VALUES ('weakness', 'effects.weakness', 'effects.weakness_desc', 'weakness', 5.0, 1, 'refresh', true, '{"attackDamage":{"type":"percent","value":-0.25}}', null, '{"duration":8.0,"statModifiers":{"attackDamage":{"value":-0.45}}}');

-- Creature effects
INSERT INTO "world"."creature_effects" ("creature_id", "trigger", "effect_id", "chance", "stacks", "min_level", "max_level", "max_chance")
VALUES ('zombie', 'on_hit', 'weakness', 0.3, 1, 1, 0, 0.5);
