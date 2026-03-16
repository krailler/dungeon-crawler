-- Create the two schemas
CREATE SCHEMA IF NOT EXISTS "characters";
CREATE SCHEMA IF NOT EXISTS "world";

-- Move existing tables from public to characters schema
ALTER TABLE "public"."accounts" SET SCHEMA "characters";
ALTER TABLE "public"."characters" SET SCHEMA "characters";

-- Create character_inventory in characters schema
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

-- Create items table in world schema
CREATE TABLE "world"."items" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "icon" text NOT NULL,
  "max_stack" integer DEFAULT 1 NOT NULL,
  "consumable" boolean DEFAULT false NOT NULL,
  "cooldown" real DEFAULT 0 NOT NULL,
  "effect_type" text DEFAULT '' NOT NULL,
  "effect_params" jsonb DEFAULT '{}' NOT NULL,
  "drop_weight" real DEFAULT 0 NOT NULL
);

-- Seed health potion
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "cooldown", "effect_type", "effect_params", "drop_weight")
VALUES ('health_potion', 'items.healthPotion', 'items.healthPotionDesc', 'potion_red', 10, true, 10, 'heal', '{"amount": 50}', 1.0);
