-- Add animation duration column to skills (seconds).
-- Controls how long the server holds animState and blocks auto-attack.
-- Default 0.67 matches the existing ATTACK_ANIM_DURATION constant.
ALTER TABLE "world"."skills" ADD COLUMN "anim_duration" real NOT NULL DEFAULT 0.67;

-- Update skills with custom animation durations
UPDATE "world"."skills" SET "anim_duration" = 1.2 WHERE "id" = 'ground_slam';
UPDATE "world"."skills" SET "anim_duration" = 1.5 WHERE "id" = 'war_cry';
UPDATE "world"."skills" SET "anim_duration" = 0.8 WHERE "id" = 'heavy_strike';
