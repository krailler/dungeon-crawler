# Equipment System Design

## Overview

KrawlHero uses a Diablo-inspired equipment system where each dropped item is a unique instance with randomly rolled stats. Items have guaranteed base stats plus bonus affixes selected from a weighted pool, with the number of bonuses determined by rarity.

No class restrictions — any class can equip any item. Future: optional `classReq` field on specific items.

---

## Equipment Slots

| Slot        | Key           | Typical Stats                          |
| ----------- | ------------- | -------------------------------------- |
| Weapon      | `weapon`      | attackDamage, strength, attackCooldown |
| Head        | `head`        | maxHealth, defense, vitality           |
| Chest       | `chest`       | defense, maxHealth, vitality           |
| Boots       | `boots`       | moveSpeed, agility                     |
| Accessory 1 | `accessory_1` | Any (flexible)                         |
| Accessory 2 | `accessory_2` | Any (flexible)                         |

Accessory slots accept any item with `equipSlot` starting with `accessory`.

---

## Item Templates (DB: `world.items`)

Each equipment item is defined as a template with:

```
id:          "iron_sword"
equip_slot:  "weapon"
level_req:   3
rarity:      "rare"
stat_ranges: { "attackDamage": { "min": 4, "max": 9 } }
bonus_pool:  [
  { "stat": "strength",      "min": 1, "max": 4, "weight": 5 },
  { "stat": "attackCooldown", "min": -0.02, "max": -0.06, "weight": 3 },
  { "stat": "maxHealth",      "min": 10, "max": 25, "weight": 3 }
]
```

- **stat_ranges**: Guaranteed stats — always rolled on every drop
- **bonus_pool**: Extra affixes — randomly selected based on rarity
- **weight**: Selection probability (D2-style, 1-8 scale; higher = more common)
- **level_req**: Minimum character level to equip

---

## Stat Rolling Algorithm

When a creature drops an equipment item:

### 1. Item Level

```
ilvl = creature.level
ilvlFactor = clamp((ilvl - 1) / (MAX_LEVEL - 1), 0, 1)
```

- `ilvlFactor` ranges from 0 (level 1) to 1 (level 30)
- Higher ilvl = rolls biased toward maximum values

### 2. Roll Guaranteed Stats

For each stat in `statRanges`:

```
range = max - min
effectiveRange = range * (0.5 + 0.5 * ilvlFactor)
roll = min + random()^0.8 * effectiveRange
```

- `random()^0.8` — slight bias toward higher values (D2-inspired)
- At ilvl 1: effective range is 50% of full range
- At ilvl 30: effective range is 100% of full range
- Integer stats (str, vit, agi, maxHealth, attackDamage, defense) are rounded
- Float stats (moveSpeed, attackCooldown) keep 2 decimal precision

### 3. Determine Bonus Affix Count

| Rarity    | Min Affixes | Max Affixes |
| --------- | ----------- | ----------- |
| Common    | 0           | 0           |
| Uncommon  | 1           | 1           |
| Rare      | 1           | 2           |
| Epic      | 2           | 3           |
| Legendary | 2           | 3           |

```
affixCount = min + floor(random() * (max - min + 1))
```

### 4. Select Bonus Affixes

From the `bonusPool`, select `affixCount` entries via **weighted random without replacement**:

```
For each selection:
  totalWeight = sum of remaining entries' weights
  roll = random() * totalWeight
  Walk entries, subtract weight → first entry where roll ≤ 0 wins
  Remove selected entry from pool (no duplicates)
```

### 5. Roll Bonus Stat Values

Same formula as guaranteed stats. If a bonus stat overlaps with a guaranteed stat, values are **additive**.

### 6. Create Instance

```
ItemInstance {
  id: UUID
  itemId: "iron_sword"  (template reference)
  rolledStats: { "attackDamage": 6, "strength": 2, "maxHealth": 18 }
  itemLevel: 8
}
```

Stored in `characters.item_instances` table.

---

## Stats Pipeline

Equipment modifiers are applied as flat bonuses in `EffectSystem.recomputeStats()`:

```
(base stats + equipment str/vit/agi)
  → class scaling (computeDerivedStats)
    → EQUIPMENT derived mods (flat only: maxHealth, attackDamage, defense, moveSpeed, attackCooldown)
      → talent mods (flat + percent)
        → effect mods (flat + percent from buffs/debuffs)
          → final: stat = (base + allFlat) * (1 + allPercent)
```

Equipment base stat bonuses (str/vit/agi) are applied **before** class scaling so they benefit from the class multiplier. Derived stat bonuses are applied as **flat modifiers only** (no percent) to keep values predictable and easy to compare.

---

## Persistence

### Tables

- `characters.item_instances` — Unique instances with rolled stats (UUID PK)
- `characters.character_equipment` — What's equipped (character_id + slot → instance_id)
- `characters.character_inventory` — Extended with `instance_id` column (nullable, non-null for equipment)

### Load Order (on player join)

1. Load inventory (including instanceIds) + load instances into cache
2. Load equipment + load instances into cache
3. Load consumable bar, skills, talents
4. `recomputeStats()` — includes equipment modifiers

### Save (on disconnect/auto-save)

1. Save new item instances created this session (must run first — FK dependency)
2. Save equipment slots (delete + re-insert)
3. Save inventory (with instanceIds)

---

## Loot Integration

In `GameLoop`, when a creature dies:

```
for each loot entry:
  if random() < dropChance:
    itemDef = getItemDef(entry.itemId)
    if itemDef.equipSlot:
      instance = rollEquipmentDrop(itemDef, creature.level)
      slot.instanceId = instance.id
      slot.quantity = 1
    else:
      slot.quantity = roll(minQty, maxQty)  // consumable
    bag.items.set(slotIndex, slot)
```

When a player picks up equipment from a loot bag, the instanceId is preserved and the instance is cached in `player.instanceItemIds` for equipment methods.

---

## Client Architecture

- **itemInstanceStore**: Lazy-loads instance data (rolledStats, itemLevel) from server via `INSTANCE_DEFS_REQUEST/RESPONSE`
- **EquipmentTab**: Paperdoll 3x3 grid in CharacterSheet (head top-center, weapon left, chest center, boots bottom-center, accessories right column) with drag-to-equip from inventory
- **Tooltips**: Show item name (colored by rarity), equipment slot, item level, level requirement, and rolled stats (green text). Shift-held comparison arrows vs equipped item.
- **InventoryPanel**: Right-click → auto-equip to matching slot (accessories pick first empty slot). Drag-and-drop to equipment slots.
- **ItemSlotView**: Reusable pure-visual item slot component (used in lobby inventory)
- **Lobby Inventory**: REST API-based inventory management outside dungeon rooms (`/api/inventory/:characterId`). Full equip/unequip/swap/destroy with drag-and-drop and context menus.
- **State sync**: `PlayerSecretState.equipment` (MapSchema<EquipmentSlotState>) synced via Colyseus @view

---

## Initial Items

### Zombie Drops (low chance)

| Item         | Slot      | Rarity   | Guaranteed Stats             | Drop Rate |
| ------------ | --------- | -------- | ---------------------------- | --------- |
| Rusty Sword  | weapon    | common   | attackDamage 2-5             | 8%        |
| Leather Cap  | head      | common   | maxHealth 8-18               | 8%        |
| Leather Vest | chest     | common   | defense 1-3, maxHealth 10-22 | 8%        |
| Worn Boots   | boots     | common   | moveSpeed 0.1-0.3            | 8%        |
| Bone Ring    | accessory | uncommon | strength 1-3                 | 4%        |

### Golem Boss Drops (higher chance)

| Item             | Slot      | Rarity | Guaranteed Stats             | Drop Rate |
| ---------------- | --------- | ------ | ---------------------------- | --------- |
| Iron Sword       | weapon    | rare   | attackDamage 4-9             | 25%       |
| Golem Crusher    | weapon    | epic   | attackDamage 7-14            | 10%       |
| Stoneplate Helm  | head      | rare   | maxHealth 20-40, defense 2-4 | 20%       |
| Stoneplate Armor | chest     | rare   | defense 3-6, maxHealth 25-50 | 20%       |
| Ring of Fury     | accessory | rare   | strength 2-5                 | 15%       |

---

## Adding New Equipment

To add a new equippable item, only a DB insert is needed:

```sql
INSERT INTO "world"."items" (
  "id", "name", "description", "icon",
  "max_stack", "consumable", "rarity",
  "equip_slot", "level_req", "stat_ranges", "bonus_pool"
) VALUES (
  'new_item_id',
  'items.newItem',         -- i18n key
  'items.newItemDesc',     -- i18n key
  'icon_name',             -- PNG in /textures/icons/
  1, false, 'rare',
  'weapon', 5,             -- slot + level req
  '{"attackDamage":{"min":5,"max":10}}',
  '[{"stat":"strength","min":1,"max":3,"weight":5}]'
);

-- Add to creature loot table
INSERT INTO "world"."creature_loot" ("creature_id", "item_id", "drop_chance", "min_quantity", "max_quantity")
VALUES ('zombie', 'new_item_id', 0.05, 1, 1);
```

Then add i18n keys to `en.json` and `es.json`.

---

## Future Extensions

| Feature                | How it fits                                                   |
| ---------------------- | ------------------------------------------------------------- |
| **Set bonuses**        | New `world.item_sets` table + logic in recomputeStats         |
| **Weapon types**       | Field on items, affects animation/range                       |
| **Enchantments**       | `character_item_enchants` table per instance                  |
| **Sockets/Gems**       | JSONB `sockets` on items + gem table                          |
| **Item level scaling** | ilvl field + formula to scale stat ranges dynamically         |
| **Class restrictions** | `classReq` column (already in schema types, null = any class) |
| **Transmog**           | Visual skin field on equipment, separate from stats           |
| **Rerolling**          | Enchanting system (reroll one affix, D3-style)                |
