-- Create enum types for talent effect fields
CREATE TYPE "world"."talent_effect_type" AS ENUM ('stat_mod', 'unlock_skill', 'modify_skill');
CREATE TYPE "world"."stat_mod_type" AS ENUM ('flat', 'percent');

-- Convert existing text columns to enum types
ALTER TABLE "world"."talent_effects"
  ALTER COLUMN "effect_type" TYPE "world"."talent_effect_type" USING "effect_type"::"world"."talent_effect_type";

ALTER TABLE "world"."talent_effects"
  ALTER COLUMN "stat_mod_type" TYPE "world"."stat_mod_type" USING "stat_mod_type"::"world"."stat_mod_type";
