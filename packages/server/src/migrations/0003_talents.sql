-- Talent definitions per class
CREATE TABLE "world"."talents" (
  "id" text PRIMARY KEY NOT NULL,
  "class_id" text NOT NULL REFERENCES "world"."classes"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL DEFAULT '',
  "max_rank" integer NOT NULL DEFAULT 1,
  "required_talent_id" text,
  "required_talent_rank" integer NOT NULL DEFAULT 1,
  "required_level" integer NOT NULL DEFAULT 1,
  "row" integer NOT NULL DEFAULT 0,
  "col" integer NOT NULL DEFAULT 0
);

-- Per-rank effects for each talent
CREATE TABLE "world"."talent_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "talent_id" text NOT NULL REFERENCES "world"."talents"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL DEFAULT 1,
  "effect_type" text NOT NULL,
  "stat_name" text,
  "stat_mod_type" text,
  "stat_mod_value" real,
  "skill_id" text,
  "cooldown_mul" real,
  "damage_mul" real
);

-- Player talent allocations
CREATE TABLE "characters"."character_talents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "talent_id" text NOT NULL,
  "rank" integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "idx_char_talents_talent" ON "characters"."character_talents" ("character_id", "talent_id");
CREATE INDEX "idx_char_talents_char" ON "characters"."character_talents" ("character_id");

-- Add talent_points column to characters
ALTER TABLE "characters"."characters" ADD COLUMN "talent_points" integer NOT NULL DEFAULT 0;

-- ── Seed: Warrior talent tree ───────────────────────────────────────────────

-- Row 0: base talents (no prerequisites)
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_toughness',  'warrior', 'talents.warriorToughness.name',  'talents.warriorToughness.desc',  'shield',  3, NULL, 0, 1, 0, 0),
  ('warrior_might',      'warrior', 'talents.warriorMight.name',      'talents.warriorMight.desc',      'sword',   3, NULL, 0, 1, 0, 1),
  ('warrior_swiftness',  'warrior', 'talents.warriorSwiftness.name',  'talents.warriorSwiftness.desc',  'agility', 2, NULL, 0, 1, 0, 2);

-- Row 1: requires row 0 talents at rank 2, level 5
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_thick_skin', 'warrior', 'talents.warriorThickSkin.name', 'talents.warriorThickSkin.desc', 'shield',  3, 'warrior_toughness', 2, 5, 1, 0),
  ('warrior_cleave',     'warrior', 'talents.warriorCleave.name',    'talents.warriorCleave.desc',    'sword',   1, 'warrior_might',     2, 5, 1, 1),
  ('warrior_rush',       'warrior', 'talents.warriorRush.name',      'talents.warriorRush.desc',      'agility', 1, 'warrior_swiftness', 2, 5, 1, 2);

-- Row 2: capstone, requires row 1 talent at rank 2, level 10
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_last_stand', 'warrior', 'talents.warriorLastStand.name', 'talents.warriorLastStand.desc', 'shield', 1, 'warrior_thick_skin', 2, 10, 2, 1);

-- ── Seed: Talent effects ────────────────────────────────────────────────────

-- warrior_toughness: +5%/+10%/+15% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_toughness', 1, 'stat_mod', 'maxHealth', 'percent', 0.05),
  ('warrior_toughness', 2, 'stat_mod', 'maxHealth', 'percent', 0.10),
  ('warrior_toughness', 3, 'stat_mod', 'maxHealth', 'percent', 0.15);

-- warrior_might: +2/+4/+6 attackDamage flat
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_might', 1, 'stat_mod', 'attackDamage', 'flat', 2),
  ('warrior_might', 2, 'stat_mod', 'attackDamage', 'flat', 4),
  ('warrior_might', 3, 'stat_mod', 'attackDamage', 'flat', 6);

-- warrior_swiftness: +3%/+6% moveSpeed
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_swiftness', 1, 'stat_mod', 'moveSpeed', 'percent', 0.03),
  ('warrior_swiftness', 2, 'stat_mod', 'moveSpeed', 'percent', 0.06);

-- warrior_thick_skin: +1/+2/+3 defense flat
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_thick_skin', 1, 'stat_mod', 'defense', 'flat', 1),
  ('warrior_thick_skin', 2, 'stat_mod', 'defense', 'flat', 2),
  ('warrior_thick_skin', 3, 'stat_mod', 'defense', 'flat', 3);

-- warrior_cleave: modifies heavy_strike (0.8x cooldown, 1.2x damage)
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_cleave', 1, 'modify_skill', 'heavy_strike', 0.8, 1.2);

-- warrior_rush: +10% moveSpeed
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_rush', 1, 'stat_mod', 'moveSpeed', 'percent', 0.10);

-- warrior_last_stand: +20% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_last_stand', 1, 'stat_mod', 'maxHealth', 'percent', 0.20);
