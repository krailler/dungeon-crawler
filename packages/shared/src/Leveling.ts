import {
  MAX_LEVEL,
  XP_CURVE_BASE,
  XP_CURVE_EXPONENT,
  BASE_XP_PER_KILL,
  XP_PER_ENEMY_LEVEL,
  LEVEL_DIFF_PENALTY_PER_LEVEL,
  LEVEL_DIFF_BONUS_PER_LEVEL,
  LEVEL_DIFF_MIN_MODIFIER,
} from "./constants/economy.js";

/**
 * XP required to advance from `level` to `level + 1`.
 * Returns 0 at max level (no more XP needed).
 *
 * Formula: floor(XP_CURVE_BASE × level ^ XP_CURVE_EXPONENT)
 */
export function xpToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
}

/**
 * Compute XP earned per player when an enemy is killed.
 *
 * Unlike gold, XP is NOT split among party members — each alive player
 * gets the full amount. The incentive for grouping is survivability,
 * not XP per kill.
 *
 * Level difference modifier (same as gold):
 * - Killing much lower enemies (>5 levels below): 10% XP (anti-farming)
 * - Killing lower enemies: -10% per level below
 * - Killing higher enemies: +5% per level above (risk/reward)
 */
export function computeXpDrop(enemyLevel: number, playerLevel: number): number {
  const baseXp = BASE_XP_PER_KILL + enemyLevel * XP_PER_ENEMY_LEVEL;

  const levelDiff = enemyLevel - playerLevel;
  let modifier: number;
  if (levelDiff < -5) {
    modifier = LEVEL_DIFF_MIN_MODIFIER;
  } else if (levelDiff < 0) {
    modifier = 1 + levelDiff * LEVEL_DIFF_PENALTY_PER_LEVEL;
  } else {
    modifier = 1 + levelDiff * LEVEL_DIFF_BONUS_PER_LEVEL;
  }

  return Math.max(1, Math.round(baseXp * modifier));
}
