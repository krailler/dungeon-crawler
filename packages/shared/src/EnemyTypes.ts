import type { BaseStats, DerivedStats } from "./Stats.js";
import { computeDerivedStats } from "./Stats.js";
import { ENEMY_STAT_SCALE_PER_LEVEL } from "./constants/economy.js";

// ── Enemy type IDs ──────────────────────────────────────────────────────────

export const EnemyTypeId = {
  ZOMBIE: "zombie",
} as const;

export type EnemyTypeIdValue = (typeof EnemyTypeId)[keyof typeof EnemyTypeId];

// ── Enemy type definition ───────────────────────────────────────────────────

export interface EnemyTypeDefinition {
  id: EnemyTypeIdValue;
  baseStats: BaseStats;
  /** Override any derived stat after formula computation */
  overrides: Partial<DerivedStats>;
  detectionRange: number;
  attackRange: number;
  /** Max distance from spawn before enemy resets aggro and walks back */
  leashRange: number;
  skin: string;
}

// ── Enemy type registry ─────────────────────────────────────────────────────

/**
 * Enemy types with base stats + overrides to keep current game balance:
 *
 * Zombie (stats 6/4/6):
 *   formula → maxHealth=70, attack=8, defense=1, speed=4.6, cooldown=1.08
 *   overrides → maxHealth=30, speed=3, cooldown=1.5
 *   final → matches original hardcoded values
 */
export const ENEMY_TYPES: Record<EnemyTypeIdValue, EnemyTypeDefinition> = {
  zombie: {
    id: EnemyTypeId.ZOMBIE,
    baseStats: { strength: 6, vitality: 4, agility: 6 },
    overrides: {
      maxHealth: 30,
      moveSpeed: 3,
      attackCooldown: 1.5,
    },
    detectionRange: 12,
    attackRange: 2.5,
    leashRange: 20,
    skin: "zombie",
  },
};

// ── Compute enemy derived stats ─────────────────────────────────────────────

/**
 * Compute derived stats for an enemy type, applying formula first then overrides.
 * Also applies the definition's attackRange.
 */
export function computeEnemyDerivedStats(typeDef: EnemyTypeDefinition): DerivedStats {
  const derived = computeDerivedStats(typeDef.baseStats);

  // Apply overrides
  return {
    ...derived,
    ...typeDef.overrides,
    attackRange: typeDef.attackRange,
  };
}

/**
 * Scale derived stats for an enemy based on its level.
 * Multiplies maxHealth, attackDamage, defense by a level-based factor.
 * Speed, cooldown, and range are NOT scaled to preserve gameplay feel.
 */
export function scaleEnemyDerivedStats(derived: DerivedStats, level: number): DerivedStats {
  if (level <= 1) return derived;
  const scale = 1 + (level - 1) * ENEMY_STAT_SCALE_PER_LEVEL;
  return {
    ...derived,
    maxHealth: Math.round(derived.maxHealth * scale),
    attackDamage: Math.round(derived.attackDamage * scale),
    defense: Math.round(derived.defense * scale),
  };
}
