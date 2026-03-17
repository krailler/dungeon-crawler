-- Skill definitions (world data)
CREATE TABLE "world"."skills" (
  "id"                text PRIMARY KEY,
  "name"              text NOT NULL,
  "description"       text NOT NULL DEFAULT '',
  "icon"              text NOT NULL,
  "passive"           boolean NOT NULL DEFAULT false,
  "cooldown"          real NOT NULL DEFAULT 0,
  "damage_multiplier" real NOT NULL DEFAULT 1
);

-- Seed existing skills (name/description store i18n keys)
INSERT INTO "world"."skills" ("id", "name", "description", "icon", "passive", "cooldown", "damage_multiplier") VALUES
  ('basic_attack', 'skills.basicAttack', 'skills.basicAttackDesc', 'sword', true,  0, 1),
  ('heavy_strike', 'skills.heavyStrike', 'skills.heavyStrikeDesc', 'fist',  false, 5, 2.5);

-- Per-character unlocked skills
CREATE TABLE "characters"."character_skills" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "skill_id"     text NOT NULL
);
CREATE UNIQUE INDEX "idx_char_skills_skill" ON "characters"."character_skills" ("character_id", "skill_id");
CREATE INDEX "idx_char_skills_char" ON "characters"."character_skills" ("character_id");
