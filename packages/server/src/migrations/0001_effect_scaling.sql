-- Add scaling support to effects
ALTER TABLE "world"."effects" ADD COLUMN "scaling" jsonb;

-- Add level gating and scaling override to creature effects
ALTER TABLE "world"."creature_effects" ADD COLUMN "min_level" integer NOT NULL DEFAULT 0;
ALTER TABLE "world"."creature_effects" ADD COLUMN "max_level" integer NOT NULL DEFAULT 0;
ALTER TABLE "world"."creature_effects" ADD COLUMN "max_chance" real;
ALTER TABLE "world"."creature_effects" ADD COLUMN "scaling_override" jsonb;

-- Update weakness effect with scaling config (base: -25% 5s → max: -45% 8s)
UPDATE "world"."effects" SET "scaling" = '{"duration":8.0,"statModifiers":{"attackDamage":{"value":-0.45}}}'
WHERE "id" = 'weakness';

-- Update zombie weakness with level range and max chance (scales from level 1 to MAX_LEVEL)
UPDATE "world"."creature_effects" SET "min_level" = 1, "max_level" = 0, "max_chance" = 0.5
WHERE "creature_id" = 'zombie' AND "effect_id" = 'weakness';
