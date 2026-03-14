import type { BaseStats, DerivedStats, StatScaling } from "./Stats";
import { computeDerivedStats, PLAYER_SCALING } from "./Stats";

// ── Enemy type IDs ───────────────────────────────────────────────────────────

export const EnemyTypeId = {
  ZOMBIE: "zombie",
} as const;

export type EnemyTypeIdValue = (typeof EnemyTypeId)[keyof typeof EnemyTypeId];

// ── Enemy type definitions ───────────────────────────────────────────────────

export type EnemyTypeDefinition = {
  id: EnemyTypeIdValue;
  baseStats: BaseStats;
  /** Override specific derived stats (e.g. to preserve hand-tuned values) */
  overrides: Partial<DerivedStats>;
  detectionRange: number;
  attackRange: number;
  /** Model path segment under public/models/characters/ */
  skin: string;
};

export const ENEMY_TYPES: Record<EnemyTypeIdValue, EnemyTypeDefinition> = {
  zombie: {
    id: "zombie",
    baseStats: { strength: 6, vitality: 4, agility: 6 },
    overrides: { maxHealth: 30, moveSpeed: 3 },
    detectionRange: 12,
    attackRange: 2.5,
    skin: "zombie",
  },
};

// ── Compute enemy derived stats ──────────────────────────────────────────────

/**
 * Compute derived stats for an enemy type.
 * Uses PLAYER_SCALING as base formula, then applies per-type overrides.
 */
export function computeEnemyDerivedStats(
  typeDef: EnemyTypeDefinition,
  scaling: StatScaling = PLAYER_SCALING,
): DerivedStats {
  const derived = computeDerivedStats(typeDef.baseStats, scaling);
  return {
    ...derived,
    ...typeDef.overrides,
    // attackRange comes from the type definition, not from formula
    attackRange: typeDef.attackRange,
  };
}
