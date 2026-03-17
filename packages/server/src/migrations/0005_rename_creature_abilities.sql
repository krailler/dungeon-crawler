-- Rename creature_abilities → creature_effects
ALTER TABLE IF EXISTS "world"."creature_abilities" RENAME TO "creature_effects";
