import {
  MAX_LEVEL,
  XP_CURVE_BASE,
  XP_CURVE_EXPONENT,
  BASE_XP_PER_KILL,
  XP_PER_CREATURE_LEVEL,
} from "./constants/economy.js";
import { computeLevelModifier } from "./Economy.js";

/**
 * XP required to advance from `level` to `level + 1`.
 * Returns 0 at max level (no more XP needed).
 *
 * Formula: floor(XP_CURVE_BASE × level ^ XP_CURVE_EXPONENT)
 */
export function xpToNextLevel(level: number): number {
  if (level < 1 || level >= MAX_LEVEL) return 0;
  return Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
}

/**
 * Compute XP earned per player when a creature is killed.
 *
 * Unlike gold, XP is NOT split among party members — each alive player
 * gets the full amount. The incentive for grouping is survivability,
 * not XP per kill.
 *
 * Uses the shared level-difference modifier (same formula as gold).
 */
export function computeXpDrop(creatureLevel: number, playerLevel: number): number {
  const baseXp = BASE_XP_PER_KILL + creatureLevel * XP_PER_CREATURE_LEVEL;
  const modifier = computeLevelModifier(creatureLevel, playerLevel);
  return Math.max(1, Math.round(baseXp * modifier));
}
