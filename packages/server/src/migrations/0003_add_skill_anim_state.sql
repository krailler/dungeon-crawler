ALTER TABLE "world"."skills" ADD COLUMN "anim_state" text NOT NULL DEFAULT 'punch';
--> statement-breakpoint
UPDATE "world"."skills" SET "anim_state" = 'heavy_punch' WHERE "id" = 'heavy_strike';
