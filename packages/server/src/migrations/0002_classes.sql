-- Character classes table
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

-- Junction table: which skills each class has access to
CREATE TABLE "world"."class_skills" (
  "class_id" text NOT NULL REFERENCES "world"."classes"("id"),
  "skill_id" text NOT NULL REFERENCES "world"."skills"("id"),
  PRIMARY KEY ("class_id", "skill_id")
);

-- Seed warrior class with current PLAYER_SCALING values
INSERT INTO "world"."classes" ("id", "name", "description", "icon", "hp_base", "hp_per_vit", "attack_base", "attack_per_str", "defense_base", "defense_per_vit", "speed_base", "speed_per_agi", "cooldown_base", "cooldown_per_agi", "attack_range")
VALUES ('warrior', 'Warrior', 'A sturdy melee fighter who excels in close combat.', '⚔️', 50, 5, 5, 0.5, 0, 0.3, 4, 0.1, 1.2, 0.02, 2.5);

-- Assign existing skills to warrior
INSERT INTO "world"."class_skills" ("class_id", "skill_id") VALUES ('warrior', 'basic_attack'), ('warrior', 'heavy_strike');

-- Add class_id to characters (default warrior for all existing characters)
ALTER TABLE "characters"."characters" ADD COLUMN "class_id" text NOT NULL DEFAULT 'warrior';
