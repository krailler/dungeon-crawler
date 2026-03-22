import {
  BASE_GOLD_PER_KILL,
  GOLD_PER_CREATURE_LEVEL,
  LEVEL_DIFF_PENALTY_PER_LEVEL,
  LEVEL_DIFF_BONUS_PER_LEVEL,
  LEVEL_DIFF_MIN_MODIFIER,
} from "./constants/economy.js";

/**
 * Level-difference modifier for reward scaling (gold, XP).
 *
 * - Creatures 6+ levels below: minimum modifier (anti-farming)
 * - Creatures below: -10% per level below
 * - Creatures above: +5% per level above (risk/reward)
 */
export function computeLevelModifier(creatureLevel: number, referenceLevel: number): number {
  const levelDiff = creatureLevel - referenceLevel;
  if (levelDiff < -5) return LEVEL_DIFF_MIN_MODIFIER;
  if (levelDiff < 0) return 1 + levelDiff * LEVEL_DIFF_PENALTY_PER_LEVEL;
  return 1 + levelDiff * LEVEL_DIFF_BONUS_PER_LEVEL;
}

/**
 * Compute gold dropped per player when a creature is killed.
 *
 * Factors:
 * - Creature level → higher level = more gold
 * - Level difference → killing low-level creatures yields less (anti-farming)
 * - Party size → gold is split equally among alive party members
 */
export function computeGoldDrop(
  creatureLevel: number,
  averagePartyLevel: number,
  alivePartyCount: number,
): number {
  const baseGold = BASE_GOLD_PER_KILL + creatureLevel * GOLD_PER_CREATURE_LEVEL;
  const modifier = computeLevelModifier(creatureLevel, averagePartyLevel);
  return Math.max(1, Math.round((baseGold * modifier) / Math.max(1, alivePartyCount)));
}
