-- Equipment system: item instances with rolled stats + character equipment slots

-- Add equipment columns to items table
ALTER TABLE "world"."items"
  ADD COLUMN "equip_slot" text,
  ADD COLUMN "level_req" integer NOT NULL DEFAULT 1,
  ADD COLUMN "stat_ranges" jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN "bonus_pool" jsonb NOT NULL DEFAULT '[]';

-- Item instances — unique dropped items with rolled stats
CREATE TABLE "characters"."item_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "item_id" text NOT NULL,
  "rolled_stats" jsonb NOT NULL DEFAULT '{}',
  "item_level" integer NOT NULL DEFAULT 1
);

-- Add instance reference to inventory
ALTER TABLE "characters"."character_inventory"
  ADD COLUMN "instance_id" uuid REFERENCES "characters"."item_instances"("id") ON DELETE SET NULL;

-- Character equipment — what's currently equipped
CREATE TABLE "characters"."character_equipment" (
  "character_id" uuid NOT NULL REFERENCES "characters"."characters"("id") ON DELETE CASCADE,
  "slot" text NOT NULL,
  "instance_id" uuid NOT NULL REFERENCES "characters"."item_instances"("id") ON DELETE CASCADE,
  PRIMARY KEY ("character_id", "slot")
);
CREATE INDEX "idx_char_equipment_char" ON "characters"."character_equipment" ("character_id");

-- ── Seed: Equipment item templates ──────────────────────────────────────────

-- Zombie drops (common/uncommon)
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "rarity", "equip_slot", "level_req", "stat_ranges", "bonus_pool")
VALUES
  ('rusty_sword', 'items.rustySword', 'items.rustySwordDesc', 'rusty_sword', 1, false, 'common', 'weapon', 1,
   '{"attackDamage":{"min":2,"max":5}}',
   '[{"stat":"strength","min":1,"max":2,"weight":5},{"stat":"maxHealth","min":5,"max":15,"weight":3}]'),

  ('leather_cap', 'items.leatherCap', 'items.leatherCapDesc', 'leather_cap', 1, false, 'common', 'head', 1,
   '{"maxHealth":{"min":8,"max":18}}',
   '[{"stat":"vitality","min":1,"max":2,"weight":5},{"stat":"defense","min":1,"max":2,"weight":3}]'),

  ('leather_vest', 'items.leatherVest', 'items.leatherVestDesc', 'leather_vest', 1, false, 'common', 'chest', 1,
   '{"defense":{"min":1,"max":3},"maxHealth":{"min":10,"max":22}}',
   '[{"stat":"vitality","min":1,"max":3,"weight":5}]'),

  ('worn_boots', 'items.wornBoots', 'items.wornBootsDesc', 'worn_boots', 1, false, 'common', 'boots', 1,
   '{"moveSpeed":{"min":0.1,"max":0.3}}',
   '[{"stat":"agility","min":1,"max":2,"weight":5}]'),

  ('bone_ring', 'items.boneRing', 'items.boneRingDesc', 'bone_ring', 1, false, 'uncommon', 'accessory_1', 1,
   '{"strength":{"min":1,"max":3}}',
   '[{"stat":"vitality","min":1,"max":2,"weight":4},{"stat":"maxHealth","min":5,"max":10,"weight":4}]');

-- Golem boss drops (rare/epic)
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "rarity", "equip_slot", "level_req", "stat_ranges", "bonus_pool")
VALUES
  ('iron_sword', 'items.ironSword', 'items.ironSwordDesc', 'iron_sword', 1, false, 'rare', 'weapon', 3,
   '{"attackDamage":{"min":4,"max":9}}',
   '[{"stat":"strength","min":1,"max":4,"weight":5},{"stat":"attackCooldown","min":-0.02,"max":-0.06,"weight":3},{"stat":"maxHealth","min":10,"max":25,"weight":3}]'),

  ('golem_crusher', 'items.golemCrusher', 'items.golemCrusherDesc', 'golem_crusher', 1, false, 'epic', 'weapon', 5,
   '{"attackDamage":{"min":7,"max":14}}',
   '[{"stat":"strength","min":2,"max":5,"weight":5},{"stat":"vitality","min":1,"max":3,"weight":3},{"stat":"attackCooldown","min":-0.03,"max":-0.08,"weight":2}]'),

  ('stoneplate_helm', 'items.stoneplateHelm', 'items.stoneplateHelmDesc', 'stoneplate_helm', 1, false, 'rare', 'head', 3,
   '{"maxHealth":{"min":20,"max":40},"defense":{"min":2,"max":4}}',
   '[{"stat":"vitality","min":1,"max":4,"weight":5},{"stat":"strength","min":1,"max":3,"weight":3}]'),

  ('stoneplate_armor', 'items.stoneplateArmor', 'items.stoneplateArmorDesc', 'stoneplate_armor', 1, false, 'rare', 'chest', 3,
   '{"defense":{"min":3,"max":6},"maxHealth":{"min":25,"max":50}}',
   '[{"stat":"vitality","min":2,"max":5,"weight":5},{"stat":"strength","min":1,"max":3,"weight":3}]'),

  ('ring_of_fury', 'items.ringOfFury', 'items.ringOfFuryDesc', 'ring_of_fury', 1, false, 'rare', 'accessory_1', 3,
   '{"strength":{"min":2,"max":5}}',
   '[{"stat":"attackDamage","min":2,"max":6,"weight":4},{"stat":"attackCooldown","min":-0.02,"max":-0.06,"weight":3}]');

-- Add equipment to creature loot tables
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES
  -- Zombie drops (low chance per item)
  ('zombie', 'rusty_sword', 0.08, 1, 1),
  ('zombie', 'leather_cap', 0.08, 1, 1),
  ('zombie', 'leather_vest', 0.08, 1, 1),
  ('zombie', 'worn_boots', 0.08, 1, 1),
  ('zombie', 'bone_ring', 0.04, 1, 1),
  -- Golem boss drops (higher chance)
  ('golem', 'iron_sword', 0.25, 1, 1),
  ('golem', 'golem_crusher', 0.10, 1, 1),
  ('golem', 'stoneplate_helm', 0.20, 1, 1),
  ('golem', 'stoneplate_armor', 0.20, 1, 1),
  ('golem', 'ring_of_fury', 0.15, 1, 1);
