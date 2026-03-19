import type { BaseStats, DerivedStats } from "./Stats.js";
import { computeDerivedStats } from "./Stats.js";
import { CREATURE_STAT_SCALE_PER_LEVEL } from "./constants/economy.js";

// ── Creature type definition ────────────────────────────────────────────────

export interface CreatureTypeDefinition {
  id: string;
  name: string;
  baseStats: BaseStats;
  /** Override any derived stat after formula computation */
  overrides: Partial<DerivedStats>;
  detectionRange: number;
  attackRange: number;
  /** Max distance from spawn before creature resets aggro and walks back */
  leashRange: number;
  skin: string;
  /** Minimum dungeon level where this creature can appear (inclusive) */
  minLevel: number;
  /** Maximum dungeon level (inclusive). 0 = no upper limit */
  maxLevel: number;
  /** Boss creatures spawn alone in a dedicated room */
  isBoss: boolean;
}

// ── Creature loot entry ─────────────────────────────────────────────────────

export interface CreatureLootEntry {
  itemId: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
}

// ── Compute creature derived stats ──────────────────────────────────────────

/**
 * Compute derived stats for a creature type, applying formula first then overrides.
 * Also applies the definition's attackRange.
 */
export function computeCreatureDerivedStats(typeDef: CreatureTypeDefinition): DerivedStats {
  const derived = computeDerivedStats(typeDef.baseStats);

  // Apply overrides
  return {
    ...derived,
    ...typeDef.overrides,
    attackRange: typeDef.attackRange,
  };
}

/**
 * Scale derived stats for a creature based on its level.
 * Multiplies maxHealth, attackDamage, defense by a level-based factor.
 * Speed, cooldown, and range are NOT scaled to preserve gameplay feel.
 */
export function scaleCreatureDerivedStats(derived: DerivedStats, level: number): DerivedStats {
  if (level <= 1) return derived;
  const scale = 1 + (level - 1) * CREATURE_STAT_SCALE_PER_LEVEL;
  return {
    ...derived,
    maxHealth: Math.round(derived.maxHealth * scale),
    attackDamage: Math.round(derived.attackDamage * scale),
    defense: Math.round(derived.defense * scale),
  };
}
