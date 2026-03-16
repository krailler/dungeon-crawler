import {
  BASE_GOLD_PER_KILL,
  GOLD_PER_CREATURE_LEVEL,
  LEVEL_DIFF_PENALTY_PER_LEVEL,
  LEVEL_DIFF_BONUS_PER_LEVEL,
  LEVEL_DIFF_MIN_MODIFIER,
} from "./constants/economy.js";

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

  const levelDiff = creatureLevel - averagePartyLevel;
  let modifier: number;
  if (levelDiff < -5) {
    modifier = LEVEL_DIFF_MIN_MODIFIER;
  } else if (levelDiff < 0) {
    modifier = 1 + levelDiff * LEVEL_DIFF_PENALTY_PER_LEVEL;
  } else {
    modifier = 1 + levelDiff * LEVEL_DIFF_BONUS_PER_LEVEL;
  }

  return Math.max(1, Math.round((baseGold * modifier) / Math.max(1, alivePartyCount)));
}
