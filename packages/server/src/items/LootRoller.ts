import type { ItemDef, ItemInstance, BonusPoolEntry, ItemRarityValue } from "@dungeon/shared";
import { BONUS_AFFIXES_BY_RARITY, INTEGER_STATS, MAX_LEVEL } from "@dungeon/shared";
import { createInstanceInMemory } from "./ItemInstanceRegistry.js";

/**
 * Roll a single stat value within [min, max], biased toward higher values
 * and scaled by item level.
 *
 * - random()^0.8 gives a slight bias toward higher values (D2-inspired)
 * - ilvlFactor (0 at level 1, 1 at MAX_LEVEL) scales the effective range
 */
function rollStatValue(min: number, max: number, ilvlFactor: number): number {
  const range = max - min;
  // Scale effective range: at ilvl 1 you can roll 50-100% of range, at max 100%
  const effectiveRange = range * (0.5 + 0.5 * ilvlFactor);
  return min + Math.pow(Math.random(), 0.8) * effectiveRange;
}

/**
 * Select N unique entries from a weighted pool (no duplicates).
 * Uses D2-style weighted random: chance = entry.weight / totalWeight.
 */
function selectFromPool(pool: readonly BonusPoolEntry[], count: number): BonusPoolEntry[] {
  if (count <= 0 || pool.length === 0) return [];

  const available = [...pool];
  const selected: BonusPoolEntry[] = [];

  for (let i = 0; i < count && available.length > 0; i++) {
    const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;

    let chosenIdx = 0;
    for (let j = 0; j < available.length; j++) {
      roll -= available[j].weight;
      if (roll <= 0) {
        chosenIdx = j;
        break;
      }
    }

    selected.push(available[chosenIdx]);
    available.splice(chosenIdx, 1); // Remove to prevent duplicates
  }

  return selected;
}

/**
 * Roll an equipment drop: create a unique item instance with random stats.
 *
 * @param def - Item template definition (must have equipSlot set)
 * @param creatureLevel - Level of the creature that dropped the item
 * @param rarity - Override rarity (from loot table or item template)
 * @returns The created item instance
 */
export function rollEquipmentDrop(
  def: ItemDef,
  creatureLevel: number,
  rarity?: ItemRarityValue,
): ItemInstance {
  const ilvl = creatureLevel;
  const ilvlFactor = Math.min(1, Math.max(0, (ilvl - 1) / (MAX_LEVEL - 1)));
  const effectiveRarity = rarity ?? def.rarity;

  const rolledStats: Record<string, number> = {};

  // Roll guaranteed stats from template ranges
  for (const [stat, range] of Object.entries(def.statRanges)) {
    let value = rollStatValue(range.min, range.max, ilvlFactor);
    if (INTEGER_STATS.has(stat)) {
      value = Math.max(1, Math.round(value));
    } else {
      // Float stats: keep 2 decimal precision
      value = Math.round(value * 100) / 100;
    }
    rolledStats[stat] = value;
  }

  // Roll bonus affixes based on rarity
  const affixRange = BONUS_AFFIXES_BY_RARITY[effectiveRarity] ?? { min: 0, max: 0 };
  const affixCount =
    affixRange.min + Math.floor(Math.random() * (affixRange.max - affixRange.min + 1));

  if (affixCount > 0 && def.bonusPool.length > 0) {
    const selected = selectFromPool(def.bonusPool, affixCount);
    for (const entry of selected) {
      let value = rollStatValue(entry.min, entry.max, ilvlFactor);
      if (INTEGER_STATS.has(entry.stat)) {
        // For integer stats, ensure at least 1 (or -1 for negative stats)
        value = entry.min < 0 ? Math.min(-1, Math.round(value)) : Math.max(1, Math.round(value));
      } else {
        value = Math.round(value * 100) / 100;
      }

      // Add to existing stat if already rolled (guaranteed + bonus can overlap)
      rolledStats[entry.stat] = (rolledStats[entry.stat] ?? 0) + value;
    }
  }

  return createInstanceInMemory(def.id, rolledStats, ilvl);
}
