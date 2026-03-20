-- ══════════════════════════════════════════════════════════════════════════════
-- Dungeon Crawler — Initial migration (consolidated)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Schemas ──────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS "characters";
CREATE SCHEMA IF NOT EXISTS "world";

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "characters"."role" AS ENUM ('admin', 'user');
CREATE TYPE "world"."stack_behavior" AS ENUM ('refresh', 'intensity');
CREATE TYPE "world"."item_effect_type" AS ENUM ('none', 'heal');
CREATE TYPE "world"."creature_effect_trigger" AS ENUM ('on_hit', 'on_hit_behind');
CREATE TYPE "world"."talent_effect_type" AS ENUM ('stat_mod', 'unlock_skill', 'modify_skill');
CREATE TYPE "world"."stat_mod_type" AS ENUM ('flat', 'percent');

-- ── Characters schema (player data) ─────────────────────────────────────────

CREATE TABLE "characters"."accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password" text NOT NULL,
  "role" "characters"."role" NOT NULL DEFAULT 'user',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "characters"."characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "characters"."accounts"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "strength" integer NOT NULL DEFAULT 10,
  "vitality" integer NOT NULL DEFAULT 10,
  "agility" integer NOT NULL DEFAULT 10,
  "level" integer NOT NULL DEFAULT 1,
  "gold" integer NOT NULL DEFAULT 0,
  "xp" integer NOT NULL DEFAULT 0,
  "stat_points" integer NOT NULL DEFAULT 0,
  "talent_points" integer NOT NULL DEFAULT 0,
  "class_id" text NOT NULL DEFAULT 'warrior',
  "tutorials_completed" text NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "idx_characters_account_name" ON "characters"."characters" ("account_id", "name");

CREATE TABLE "characters"."character_inventory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "slot_index" integer NOT NULL,
  "item_id" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "idx_char_inventory_slot" ON "characters"."character_inventory" ("character_id", "slot_index");
CREATE INDEX "idx_char_inventory_char" ON "characters"."character_inventory" ("character_id");

CREATE TABLE "characters"."character_talents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "talent_id" text NOT NULL,
  "rank" integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX "idx_char_talents_talent" ON "characters"."character_talents" ("character_id", "talent_id");
CREATE INDEX "idx_char_talents_char" ON "characters"."character_talents" ("character_id");

CREATE TABLE "characters"."character_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "skill_id" text NOT NULL
);
CREATE UNIQUE INDEX "idx_char_skills_skill" ON "characters"."character_skills" ("character_id", "skill_id");
CREATE INDEX "idx_char_skills_char" ON "characters"."character_skills" ("character_id");

-- ── World schema (game definitions) ─────────────────────────────────────────

CREATE TABLE "world"."items" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL,
  "max_stack" integer NOT NULL DEFAULT 1,
  "consumable" boolean NOT NULL DEFAULT false,
  "cooldown" real NOT NULL DEFAULT 0,
  "effect_type" "world"."item_effect_type" NOT NULL DEFAULT 'none',
  "effect_params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "use_sound" text NOT NULL DEFAULT '',
  "transient" boolean NOT NULL DEFAULT false,
  "rarity" text NOT NULL DEFAULT 'common'
);

CREATE TABLE "world"."skills" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL,
  "passive" boolean NOT NULL DEFAULT false,
  "cooldown" real NOT NULL DEFAULT 0,
  "damage_multiplier" real NOT NULL DEFAULT 1,
  "anim_state" text NOT NULL DEFAULT 'punch',
  "hp_threshold" real NOT NULL DEFAULT 0,
  "reset_on_kill" boolean NOT NULL DEFAULT false,
  "effect_id" text NOT NULL DEFAULT '',
  "aoe_range" real NOT NULL DEFAULT 0
);

CREATE TABLE "world"."creatures" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "strength" integer NOT NULL DEFAULT 10,
  "vitality" integer NOT NULL DEFAULT 10,
  "agility" integer NOT NULL DEFAULT 10,
  "override_max_health" integer,
  "override_move_speed" real,
  "override_attack_cooldown" real,
  "override_attack_damage" integer,
  "override_defense" integer,
  "detection_range" real NOT NULL DEFAULT 12,
  "attack_range" real NOT NULL DEFAULT 2.5,
  "leash_range" real NOT NULL DEFAULT 20,
  "skin" text NOT NULL,
  "min_level" integer NOT NULL DEFAULT 1,
  "max_level" integer NOT NULL DEFAULT 0,
  "is_boss" boolean NOT NULL DEFAULT false
);

CREATE TABLE "world"."creature_loot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  "item_id" text NOT NULL REFERENCES "world"."items"("id") ON DELETE CASCADE,
  "drop_chance" real NOT NULL DEFAULT 0.25,
  "min_quantity" integer NOT NULL DEFAULT 1,
  "max_quantity" integer NOT NULL DEFAULT 1
);

CREATE TABLE "world"."effects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL,
  "duration" real NOT NULL DEFAULT 5,
  "max_stacks" integer NOT NULL DEFAULT 1,
  "stack_behavior" "world"."stack_behavior" NOT NULL DEFAULT 'refresh',
  "is_debuff" boolean NOT NULL DEFAULT true,
  "stat_modifiers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tick_effect" jsonb,
  "scaling" jsonb
);

CREATE TABLE "world"."creature_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  "trigger" "world"."creature_effect_trigger" NOT NULL,
  "effect_id" text NOT NULL REFERENCES "world"."effects"("id") ON DELETE CASCADE,
  "chance" real NOT NULL DEFAULT 0.3,
  "stacks" integer NOT NULL DEFAULT 1,
  "min_level" integer NOT NULL DEFAULT 0,
  "max_level" integer NOT NULL DEFAULT 0,
  "max_chance" real,
  "scaling_override" jsonb
);

CREATE TABLE "world"."creature_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  "skill_id" text NOT NULL REFERENCES "world"."skills"("id") ON DELETE CASCADE,
  "is_default" boolean NOT NULL DEFAULT false
);

-- Only one default skill per creature
CREATE UNIQUE INDEX "creature_skills_one_default" ON "world"."creature_skills" ("creature_id") WHERE "is_default" = true;

CREATE TABLE "world"."classes" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL DEFAULT '',
  "hp_base" real NOT NULL DEFAULT 50,
  "hp_per_vit" real NOT NULL DEFAULT 5,
  "attack_base" real NOT NULL DEFAULT 5,
  "attack_per_str" real NOT NULL DEFAULT 0.5,
  "defense_base" real NOT NULL DEFAULT 0,
  "defense_per_vit" real NOT NULL DEFAULT 0.3,
  "speed_base" real NOT NULL DEFAULT 4,
  "speed_per_agi" real NOT NULL DEFAULT 0.1,
  "cooldown_base" real NOT NULL DEFAULT 1.2,
  "cooldown_per_agi" real NOT NULL DEFAULT 0.02,
  "attack_range" real NOT NULL DEFAULT 2.5
);

CREATE TABLE "world"."class_skills" (
  "class_id" text NOT NULL REFERENCES "world"."classes"("id"),
  "skill_id" text NOT NULL REFERENCES "world"."skills"("id"),
  "is_default" boolean NOT NULL DEFAULT false,
  "unlock_level" integer NOT NULL DEFAULT 1,
  PRIMARY KEY ("class_id", "skill_id")
);

-- Only one default skill per class
CREATE UNIQUE INDEX "class_skills_one_default" ON "world"."class_skills" ("class_id") WHERE "is_default" = true;

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

CREATE TABLE "world"."talent_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "talent_id" text NOT NULL REFERENCES "world"."talents"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL DEFAULT 1,
  "effect_type" "world"."talent_effect_type" NOT NULL,
  "stat_name" text,
  "stat_mod_type" "world"."stat_mod_type",
  "stat_mod_value" real,
  "skill_id" text,
  "cooldown_mul" real,
  "damage_mul" real
);

-- ══════════════════════════════════════════════════════════════════════════════
-- Seed data
-- ══════════════════════════════════════════════════════════════════════════════

-- Items
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "cooldown", "effect_type", "effect_params", "use_sound", "transient", "rarity")
VALUES
  ('health_potion', 'items.healthPotion', 'items.healthPotionDesc', 'potion_red', 10, true, 10, 'heal', '{"amount": 50}', 'potion_drink', false, 'common'),
  ('dungeon_key', 'items.dungeonKey', 'items.dungeonKeyDesc', 'key', 1, false, 0, 'none', '{}', '', true, 'legendary');

-- Skills
INSERT INTO "world"."skills" ("id", "name", "description", "icon", "passive", "cooldown", "damage_multiplier", "anim_state", "hp_threshold", "reset_on_kill", "effect_id", "aoe_range") VALUES
  ('basic_attack',  'skills.basicAttack',  'skills.basicAttackDesc',  'sword',       true,  0,  1,   'punch',       0,   false, '',             0),
  ('heavy_strike',  'skills.heavyStrike',  'skills.heavyStrikeDesc',  'fist',        false, 5,  2.5, 'heavy_punch', 0,   false, '',             0),
  ('execute',       'skills.execute',      'skills.executeDesc',      'execute',     false, 10, 4.0, 'execute',     0.3, true,  '',             0),
  ('war_cry',       'skills.warCry',       'skills.warCryDesc',       'war_cry',     false, 20, 0,   'war_cry',     0,   false, 'war_cry_buff', 8.0),
  ('ground_slam',   'skills.groundSlam',   'skills.groundSlamDesc',   'ground_slam', false, 12, 1.8, 'ground_slam', 0,   false, 'dazed',        3.0),
  ('golem_slam',    'skills.golemSlam',    'skills.golemSlamDesc',    'fist',        true,  0,  1.5, 'punch',       0,   false, '',             0);

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

INSERT INTO "world"."creatures" (
  "id", "name", "strength", "vitality", "agility",
  "override_max_health", "override_move_speed", "override_attack_cooldown",
  "detection_range", "attack_range", "leash_range",
  "skin", "min_level", "max_level", "is_boss"
) VALUES (
  'golem', 'creatures.golem', 8, 10, 3,
  100, 2.0, 2.5,
  15, 3.0, 50,
  'golem', 1, 0, true
);

-- Creature loot
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES
  ('zombie', 'health_potion', 0.8, 1, 1),
  ('golem', 'health_potion', 1.0, 2, 3),
  ('golem', 'dungeon_key', 1.0, 1, 1);

-- Effects
INSERT INTO "world"."effects" ("id", "name", "description", "icon", "duration", "max_stacks", "stack_behavior", "is_debuff", "stat_modifiers", "tick_effect", "scaling")
VALUES
  ('weakness', 'effects.weakness', 'effects.weaknessDesc', 'weakness', 5.0, 1, 'refresh', true,
   '{"attackDamage":{"type":"percent","value":-0.25}}', null,
   '{"duration":8.0,"statModifiers":{"attackDamage":{"value":-0.45}}}'),
  ('hamstring', 'effects.hamstring', 'effects.hamstringDesc', 'hamstring', 3.0, 1, 'refresh', true,
   '{"moveSpeed":{"type":"percent","value":-0.35}}', null,
   '{"duration":5.0,"statModifiers":{"moveSpeed":{"value":-0.50}}}'),
  ('war_cry_buff', 'effects.warCry', 'effects.warCryDesc', 'war_cry_buff', 8.0, 1, 'refresh', false,
   '{"attackDamage":{"type":"percent","value":0.20}}', null, null),
  ('dazed', 'effects.dazed', 'effects.dazedDesc', 'dazed', 3.0, 1, 'refresh', true,
   '{"moveSpeed":{"type":"percent","value":-0.30}}', null, null);

-- Creature effects (on-hit triggers)
INSERT INTO "world"."creature_effects" ("creature_id", "trigger", "effect_id", "chance", "stacks", "min_level", "max_level", "max_chance")
VALUES
  ('zombie', 'on_hit', 'weakness', 0.3, 1, 1, 0, 0.5),
  ('zombie', 'on_hit_behind', 'hamstring', 0.5, 1, 1, 0, 0.7);

-- Creature skills
INSERT INTO "world"."creature_skills" ("creature_id", "skill_id", "is_default")
VALUES
  ('zombie', 'basic_attack', true),
  ('golem', 'golem_slam', true);

-- Classes
INSERT INTO "world"."classes" ("id", "name", "description", "icon", "hp_base", "hp_per_vit", "attack_base", "attack_per_str", "defense_base", "defense_per_vit", "speed_base", "speed_per_agi", "cooldown_base", "cooldown_per_agi", "attack_range")
VALUES ('warrior', 'classes.warrior.name', 'classes.warrior.desc', '⚔️', 50, 5, 5, 0.5, 0, 0.3, 4, 0.1, 1.2, 0.02, 2.5);

-- Class skills
INSERT INTO "world"."class_skills" ("class_id", "skill_id", "is_default", "unlock_level") VALUES
  ('warrior', 'basic_attack',  true,  1),
  ('warrior', 'heavy_strike',  false, 1),
  ('warrior', 'war_cry',       false, 8),
  ('warrior', 'ground_slam',   false, 15),
  ('warrior', 'execute',       false, 22);

-- ── Talents: Warrior tree (6 rows × 3 columns) ─────────────────────────────
--
--   Col 0 (Fortitude)      Col 1 (Arms)           Col 2 (Tactics)
--   ─────────────────      ──────────────         ────────────────
--   Row 0: Toughness(3)    Might(3)               Swiftness(2)
--   Row 1: Thick Skin(3)   Brutal Strikes(2)      Agile Fighter(2)
--   Row 2: Resilience(2)   Rending Blow(2)        Battle Tempo(2)
--   Row 3: Unbreakable(2)  Executioner(2)         War Rhythm(2)
--   Row 4: Fortify(2)      Rampage(2)             Quick Hands(2)
--   Row 5: Last Stand(1)   Berserker(1)           Battle Master(1)

-- Row 0: base talents (no prerequisites, level 5)
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_toughness',  'warrior', 'talents.warriorToughness.name',  'talents.warriorToughness.desc',  'toughness',  3, NULL, 0, 5, 0, 0),
  ('warrior_might',      'warrior', 'talents.warriorMight.name',      'talents.warriorMight.desc',      'might',      3, NULL, 0, 5, 0, 1),
  ('warrior_swiftness',  'warrior', 'talents.warriorSwiftness.name',  'talents.warriorSwiftness.desc',  'swiftness',  2, NULL, 0, 5, 0, 2);

-- Row 1: requires row 0 parent at rank 2, level 10
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_thick_skin',     'warrior', 'talents.warriorThickSkin.name',     'talents.warriorThickSkin.desc',     'thick_skin',      3, 'warrior_toughness',  2, 10, 1, 0),
  ('warrior_brutal_strikes', 'warrior', 'talents.warriorBrutalStrikes.name', 'talents.warriorBrutalStrikes.desc', 'brutal_strikes',  2, 'warrior_might',      2, 10, 1, 1),
  ('warrior_agile_fighter',  'warrior', 'talents.warriorAgileFighter.name',  'talents.warriorAgileFighter.desc',  'agile_fighter',   2, 'warrior_swiftness',  2, 10, 1, 2);

-- Row 2: level 15
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_resilience',   'warrior', 'talents.warriorResilience.name',   'talents.warriorResilience.desc',   'resilience',    2, 'warrior_thick_skin',     2, 15, 2, 0),
  ('warrior_rending_blow', 'warrior', 'talents.warriorRendingBlow.name',  'talents.warriorRendingBlow.desc',  'rending_blow',  2, 'warrior_brutal_strikes', 1, 15, 2, 1),
  ('warrior_battle_tempo', 'warrior', 'talents.warriorBattleTempo.name',  'talents.warriorBattleTempo.desc',  'battle_tempo',  2, 'warrior_agile_fighter',  1, 15, 2, 2);

-- Row 3: level 20
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_unbreakable',  'warrior', 'talents.warriorUnbreakable.name',  'talents.warriorUnbreakable.desc',  'unbreakable',   2, 'warrior_resilience',   1, 20, 3, 0),
  ('warrior_executioner',  'warrior', 'talents.warriorExecutioner.name',  'talents.warriorExecutioner.desc',  'executioner',   2, 'warrior_rending_blow', 1, 20, 3, 1),
  ('warrior_war_rhythm',   'warrior', 'talents.warriorWarRhythm.name',    'talents.warriorWarRhythm.desc',    'war_rhythm',    2, 'warrior_battle_tempo', 1, 20, 3, 2);

-- Row 4: level 25
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_fortify',      'warrior', 'talents.warriorFortify.name',      'talents.warriorFortify.desc',      'fortify',       2, 'warrior_unbreakable', 1, 25, 4, 0),
  ('warrior_rampage',      'warrior', 'talents.warriorRampage.name',      'talents.warriorRampage.desc',      'rampage',       2, 'warrior_executioner', 1, 25, 4, 1),
  ('warrior_quick_hands',  'warrior', 'talents.warriorQuickHands.name',   'talents.warriorQuickHands.desc',   'quick_hands',   2, 'warrior_war_rhythm',  1, 25, 4, 2);

-- Row 5: Capstones (level 30)
INSERT INTO "world"."talents" ("id", "class_id", "name", "description", "icon", "max_rank", "required_talent_id", "required_talent_rank", "required_level", "row", "col")
VALUES
  ('warrior_last_stand',    'warrior', 'talents.warriorLastStand.name',    'talents.warriorLastStand.desc',    'last_stand',      1, 'warrior_fortify',     1, 30, 5, 0),
  ('warrior_berserker',     'warrior', 'talents.warriorBerserker.name',    'talents.warriorBerserker.desc',    'berserker',       1, 'warrior_rampage',     1, 30, 5, 1),
  ('warrior_battle_master', 'warrior', 'talents.warriorBattleMaster.name', 'talents.warriorBattleMaster.desc', 'battle_master',   1, 'warrior_quick_hands', 1, 30, 5, 2);

-- ── Talent effects ───────────────────────────────────────────────────────────

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

-- warrior_brutal_strikes: modify heavy_strike cooldown & damage
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_brutal_strikes', 1, 'modify_skill', 'heavy_strike', 0.85, NULL),
  ('warrior_brutal_strikes', 2, 'modify_skill', 'heavy_strike', 0.70, 1.15);

-- warrior_agile_fighter: -5%/-10% attackCooldown
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_agile_fighter', 1, 'stat_mod', 'attackCooldown', 'percent', -0.05),
  ('warrior_agile_fighter', 2, 'stat_mod', 'attackCooldown', 'percent', -0.10);

-- warrior_resilience: +8%/+16% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_resilience', 1, 'stat_mod', 'maxHealth', 'percent', 0.08),
  ('warrior_resilience', 2, 'stat_mod', 'maxHealth', 'percent', 0.16);

-- warrior_rending_blow: modify ground_slam damage & cooldown
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_rending_blow', 1, 'modify_skill', 'ground_slam', NULL,  1.20),
  ('warrior_rending_blow', 2, 'modify_skill', 'ground_slam', 0.85, 1.40);

-- warrior_battle_tempo: modify war_cry cooldown
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_battle_tempo', 1, 'modify_skill', 'war_cry', 0.85, NULL),
  ('warrior_battle_tempo', 2, 'modify_skill', 'war_cry', 0.70, NULL);

-- warrior_unbreakable: +2/+4 defense flat AND +5%/+10% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_unbreakable', 1, 'stat_mod', 'defense',   'flat',    2),
  ('warrior_unbreakable', 1, 'stat_mod', 'maxHealth', 'percent', 0.05),
  ('warrior_unbreakable', 2, 'stat_mod', 'defense',   'flat',    4),
  ('warrior_unbreakable', 2, 'stat_mod', 'maxHealth', 'percent', 0.10);

-- warrior_executioner: modify execute damage & cooldown
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_executioner', 1, 'modify_skill', 'execute', NULL, 1.20),
  ('warrior_executioner', 2, 'modify_skill', 'execute', 0.80, 1.40);

-- warrior_war_rhythm: -5%/-10% attackCooldown + rank 2 also +3% moveSpeed
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_war_rhythm', 1, 'stat_mod', 'attackCooldown', 'percent', -0.05),
  ('warrior_war_rhythm', 2, 'stat_mod', 'attackCooldown', 'percent', -0.10),
  ('warrior_war_rhythm', 2, 'stat_mod', 'moveSpeed',      'percent',  0.03);

-- warrior_fortify: +3/+5 defense flat AND +10%/+15% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_fortify', 1, 'stat_mod', 'defense',   'flat',    3),
  ('warrior_fortify', 1, 'stat_mod', 'maxHealth', 'percent', 0.10),
  ('warrior_fortify', 2, 'stat_mod', 'defense',   'flat',    5),
  ('warrior_fortify', 2, 'stat_mod', 'maxHealth', 'percent', 0.15);

-- warrior_rampage: rank 1 = heavy_strike damage ×1.20; rank 2 = heavy_strike ×1.35 + execute ×1.15
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_rampage', 1, 'modify_skill', 'heavy_strike', NULL, 1.20),
  ('warrior_rampage', 2, 'modify_skill', 'heavy_strike', NULL, 1.35),
  ('warrior_rampage', 2, 'modify_skill', 'execute',      NULL, 1.15);

-- warrior_quick_hands: -5%/-10% attackCooldown + ground_slam cooldown ×0.85/×0.70
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_quick_hands', 1, 'stat_mod', 'attackCooldown', 'percent', -0.05),
  ('warrior_quick_hands', 2, 'stat_mod', 'attackCooldown', 'percent', -0.10);

INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "skill_id", "cooldown_mul", "damage_mul")
VALUES
  ('warrior_quick_hands', 1, 'modify_skill', 'ground_slam', 0.85, NULL),
  ('warrior_quick_hands', 2, 'modify_skill', 'ground_slam', 0.70, NULL);

-- warrior_last_stand (capstone): +25% maxHealth + +5 defense
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_last_stand', 1, 'stat_mod', 'maxHealth', 'percent', 0.25),
  ('warrior_last_stand', 1, 'stat_mod', 'defense',   'flat',    5);

-- warrior_berserker (capstone): +20% attackDamage, -10% maxHealth
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_berserker', 1, 'stat_mod', 'attackDamage', 'percent',  0.20),
  ('warrior_berserker', 1, 'stat_mod', 'maxHealth',    'percent', -0.10);

-- warrior_battle_master (capstone): -15% attackCooldown, +8% moveSpeed
INSERT INTO "world"."talent_effects" ("talent_id", "rank", "effect_type", "stat_name", "stat_mod_type", "stat_mod_value")
VALUES
  ('warrior_battle_master', 1, 'stat_mod', 'attackCooldown', 'percent', -0.15),
  ('warrior_battle_master', 1, 'stat_mod', 'moveSpeed',      'percent',  0.08);
