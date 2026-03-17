-- Effects table
CREATE TABLE IF NOT EXISTS "world"."effects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "icon" text NOT NULL,
  "duration" real NOT NULL DEFAULT 5,
  "max_stacks" integer NOT NULL DEFAULT 1,
  "stack_behavior" text NOT NULL DEFAULT 'refresh',
  "is_debuff" boolean NOT NULL DEFAULT true,
  "stat_modifiers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "tick_effect" jsonb
);

-- Creature effects table
CREATE TABLE IF NOT EXISTS "world"."creature_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creature_id" text NOT NULL REFERENCES "world"."creatures"("id") ON DELETE CASCADE,
  "trigger" text NOT NULL,
  "effect_id" text NOT NULL REFERENCES "world"."effects"("id") ON DELETE CASCADE,
  "chance" real NOT NULL DEFAULT 0.3,
  "stacks" integer NOT NULL DEFAULT 1
);

-- Seed: Weakness effect
INSERT INTO "world"."effects" ("id", "name", "description", "icon", "duration", "max_stacks", "stack_behavior", "is_debuff", "stat_modifiers", "tick_effect")
VALUES ('weakness', 'effects.weakness', 'effects.weakness_desc', 'weakness', 5.0, 1, 'refresh', true, '{"attackDamage":{"type":"percent","value":-0.25}}', null)
ON CONFLICT ("id") DO NOTHING;

-- Seed: Zombie applies Weakness on hit (30% chance)
INSERT INTO "world"."creature_effects" ("creature_id", "trigger", "effect_id", "chance", "stacks")
VALUES ('zombie', 'on_hit', 'weakness', 0.3, 1)
ON CONFLICT DO NOTHING;
