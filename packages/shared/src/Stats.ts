// ── Allocatable stat identifiers ─────────────────────────────────────────────

export const AllocatableStat = {
  STRENGTH: "strength",
  VITALITY: "vitality",
  AGILITY: "agility",
} as const;

export type AllocatableStatValue = (typeof AllocatableStat)[keyof typeof AllocatableStat];

/** Runtime set for quick membership checks */
export const ALLOCATABLE_STATS: readonly AllocatableStatValue[] = [
  AllocatableStat.STRENGTH,
  AllocatableStat.VITALITY,
  AllocatableStat.AGILITY,
];

// ── Base stats ──────────────────────────────────────────────────────────────

export interface BaseStats {
  strength: number;
  vitality: number;
  agility: number;
}

// ── Derived stats ───────────────────────────────────────────────────────────

export interface DerivedStats {
  maxHealth: number;
  attackDamage: number;
  defense: number;
  moveSpeed: number;
  attackCooldown: number;
  attackRange: number;
}

// ── Scaling configuration ───────────────────────────────────────────────────

export interface StatScaling {
  healthBase: number;
  healthPerVit: number;
  attackBase: number;
  attackPerStr: number;
  defenseBase: number;
  defensePerVit: number;
  speedBase: number;
  speedPerAgi: number;
  cooldownBase: number;
  cooldownPerAgi: number;
  attackRange: number;
}

/**
 * Default player scaling — calibrated so stats 10/10/10 produce the same
 * values as the original hardcoded constants:
 *
 *   maxHealth     = 50 + 10 × 5    = 100
 *   attackDamage  = 5  + 10 × 0.5  = 10
 *   defense       = 0  + 10 × 0.3  = 3
 *   moveSpeed     = 4  + 10 × 0.1  = 5
 *   attackCooldown = 1.2 - 10 × 0.02 = 1.0
 *   attackRange   = 2.5
 */
export const PLAYER_SCALING: StatScaling = {
  healthBase: 50,
  healthPerVit: 5,
  attackBase: 5,
  attackPerStr: 0.5,
  defenseBase: 0,
  defensePerVit: 0.3,
  speedBase: 4,
  speedPerAgi: 0.1,
  cooldownBase: 1.2,
  cooldownPerAgi: 0.02,
  attackRange: 2.5,
};

export const DEFAULT_PLAYER_STATS: BaseStats = {
  strength: 10,
  vitality: 10,
  agility: 10,
};

// ── Compute functions ───────────────────────────────────────────────────────

export function computeDerivedStats(
  base: BaseStats,
  scaling: StatScaling = PLAYER_SCALING,
): DerivedStats {
  return {
    maxHealth: Math.round(scaling.healthBase + base.vitality * scaling.healthPerVit),
    attackDamage: Math.round(scaling.attackBase + base.strength * scaling.attackPerStr),
    defense: Math.round(scaling.defenseBase + base.vitality * scaling.defensePerVit),
    moveSpeed: scaling.speedBase + base.agility * scaling.speedPerAgi,
    attackCooldown: Math.max(0.3, scaling.cooldownBase - base.agility * scaling.cooldownPerAgi),
    attackRange: scaling.attackRange,
  };
}

/**
 * Final damage formula: flat subtraction with minimum 1.
 * Simple, predictable, easy to balance.
 */
export function computeDamage(attackDamage: number, targetDefense: number): number {
  return Math.max(1, attackDamage - targetDefense);
}
