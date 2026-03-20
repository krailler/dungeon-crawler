-- Add new item effect type
ALTER TYPE "world"."item_effect_type" ADD VALUE 'apply_effect';

-- Regeneration effect (heal over time)
INSERT INTO "world"."effects" ("id", "name", "description", "icon", "duration", "max_stacks", "stack_behavior", "is_debuff", "stat_modifiers", "tick_effect", "scaling")
VALUES
  ('regeneration', 'effects.regeneration', 'effects.regenerationDesc', 'potion_regen', 10.0, 1, 'refresh', false,
   '{}', '{"type":"heal","value":8,"interval":2}',
   '{"duration":12.0,"tickEffect":{"value":15}}');

-- Regeneration Potion item (applies regeneration buff)
INSERT INTO "world"."items" ("id", "name", "description", "icon", "max_stack", "consumable", "cooldown", "effect_type", "effect_params", "use_sound", "transient", "rarity")
VALUES
  ('regen_potion', 'items.regenPotion', 'items.regenPotionDesc', 'potion_regen', 5, true, 30, 'apply_effect', '{"effectId":"regeneration","healAmount":8,"interval":2,"duration":10}', 'potion_drink', false, 'uncommon');

-- Add to golem (boss) loot table
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES
  ('golem', 'regen_potion', 1.0, 1, 2);
