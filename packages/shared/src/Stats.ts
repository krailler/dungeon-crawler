// ── Base stats ───────────────────────────────────────────────────────────────

export type BaseStats = {
  strength: number;
  vitality: number;
  agility: number;
};

export const DEFAULT_PLAYER_STATS: BaseStats = {
  strength: 10,
  vitality: 10,
  agility: 10,
};

// ── Derived stats ────────────────────────────────────────────────────────────

export type DerivedStats = {
  maxHealth: number;
  attackDamage: number;
  defense: number;
  moveSpeed: number;
  attackCooldown: number;
  attackRange: number;
};

// ── Scaling constants ────────────────────────────────────────────────────────
// Calibrated so DEFAULT_PLAYER_STATS (10/10/10) produces the original values:
//   maxHealth=100, attackDamage=10, defense=3, moveSpeed=5, attackCooldown=1.0

export type StatScaling = {
  baseHealth: number;
  healthPerVit: number;
  baseAttack: number;
  attackPerStr: number;
  baseDefense: number;
  defensePerVit: number;
  baseSpeed: number;
  speedPerAgi: number;
  baseAttackCooldown: number;
  attackCooldownPerAgi: number;
  attackRange: number;
};

export const PLAYER_SCALING: StatScaling = {
  baseHealth: 50,
  healthPerVit: 5,
  baseAttack: 5,
  attackPerStr: 0.5,
  baseDefense: 0,
  defensePerVit: 0.3,
  baseSpeed: 4,
  speedPerAgi: 0.1,
  baseAttackCooldown: 1.2,
  attackCooldownPerAgi: -0.02,
  attackRange: 2.5,
};

// ── Compute functions ────────────────────────────────────────────────────────

export function computeDerivedStats(
  base: BaseStats,
  scaling: StatScaling = PLAYER_SCALING,
): DerivedStats {
  return {
    maxHealth: Math.round(scaling.baseHealth + base.vitality * scaling.healthPerVit),
    attackDamage: Math.round(scaling.baseAttack + base.strength * scaling.attackPerStr),
    defense: Math.round(scaling.baseDefense + base.vitality * scaling.defensePerVit),
    moveSpeed: scaling.baseSpeed + base.agility * scaling.speedPerAgi,
    attackCooldown: Math.max(
      0.2,
      scaling.baseAttackCooldown + base.agility * scaling.attackCooldownPerAgi,
    ),
    attackRange: scaling.attackRange,
  };
}

/**
 * Flat damage reduction with minimum 1.
 * Simple and predictable — easy to reason about at low stat values.
 */
export function computeDamage(attackDamage: number, targetDefense: number): number {
  return Math.max(1, attackDamage - targetDefense);
}
