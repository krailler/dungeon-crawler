/**
 * Effect System — Shared types and scaling utilities
 *
 * Architecture overview:
 *
 *   ┌─────────────── DB ───────────────┐
 *   │  effects          creature_effects │
 *   │  (base values,    (per-creature    │
 *   │   scaling config)  overrides)      │
 *   └────────┬────────────────┬─────────┘
 *            │                │
 *            ▼                ▼
 *   EffectRegistry    CreatureTypeRegistry
 *   (EffectDef)       (CreatureEffectEntry)
 *            │                │
 *            └──────┬─────────┘
 *                   ▼
 *            GameLoop.applyCreatureEffects()
 *              │  ├─ level gating (minLevel/maxLevel)
 *              │  ├─ computeScalingFactor() → t (0–1)
 *              │  └─ scaled chance roll
 *              ▼
 *            EffectSystem.applyEffect(player, id, stacks, t, override?)
 *              │  ├─ resolves scaling: override > def.scaling > null
 *              │  ├─ lerpEffectValue() on duration + modifiers
 *              │  ├─ computeModValue() → int8 for client tooltip
 *              │  └─ stacking: REFRESH (reset timer) or INTENSITY (add stacks)
 *              ▼
 *            ActiveEffectState (Colyseus Schema)
 *              ├─ synced: effectId, remaining, duration, stacks, modValue
 *              └─ server-only: scalingFactor, scalingOverride
 *                       │
 *                       ▼
 *            Client receives pre-computed values
 *              ├─ EffectDefClient (name, icon, isDebuff) via lazy request
 *              └─ modValue (int8) via Schema sync — NO client-side scaling
 *
 * Scaling formula:
 *   t = computeScalingFactor(dungeonLevel, minLevel, maxLevel, levelCap)
 *   scaledValue = lerpEffectValue(base, max, t)
 *              = base + clamp(t, 0, 1) * (max - base)
 *
 * Example (Weakness on zombie):
 *   DB: base duration=5s, scaling.duration=8s, base modifier=-0.25, scaling=-0.45
 *   Dungeon lvl 1 (t=0): 5s duration, -25% attack
 *   Dungeon lvl 15 (t=0.5): 6.5s duration, -35% attack
 *   Dungeon lvl 30 (t=1): 8s duration, -45% attack
 */

/** Trigger type for creature effect application */
export const CreatureEffectTrigger = {
  /** Applied when the creature lands a hit on a player */
  ON_HIT: "on_hit",
  /** Applied when the creature hits a player from behind */
  ON_HIT_BEHIND: "on_hit_behind",
} as const;
export type CreatureEffectTriggerValue =
  (typeof CreatureEffectTrigger)[keyof typeof CreatureEffectTrigger];

/** Stack behavior when an effect is re-applied */
export const StackBehavior = {
  /** Reset duration timer without adding stacks */
  REFRESH: "refresh",
  /** Add stacks (up to maxStacks) and reset timer */
  INTENSITY: "intensity",
} as const;
export type StackBehaviorValue = (typeof StackBehavior)[keyof typeof StackBehavior];

/** How a stat modifier is applied */
export const StatModType = {
  /** Added/subtracted as a flat value */
  FLAT: "flat",
  /** Multiplied as a percentage (e.g. -0.25 = -25%) */
  PERCENT: "percent",
} as const;
export type StatModTypeValue = (typeof StatModType)[keyof typeof StatModType];

export type StatModifier = {
  readonly type: StatModTypeValue;
  readonly value: number;
};

export type TickEffect = {
  readonly type: string;
  readonly value: number;
  readonly interval: number;
};

/**
 * Scaling config for an effect — max values reached at full scaling (t=1).
 * Base values come from the EffectDef fields; scaling defines the ceiling.
 * Only used server-side; clients receive pre-computed values.
 */
export type EffectScaling = {
  readonly duration?: number;
  readonly statModifiers?: Record<string, { readonly value: number }>;
  readonly tickEffect?: { readonly value: number };
};

/** Presentation-only effect info sent to the client */
export type EffectDefClient = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly isDebuff: boolean;
};

/** Effect definition loaded from the database at server startup */
export type EffectDef = {
  readonly id: string;
  /** i18n key for the effect name */
  readonly name: string;
  /** i18n key for the effect description */
  readonly description: string;
  /** Icon identifier (client maps to SVG component) */
  readonly icon: string;
  /** Duration in seconds (base value for scaling) */
  readonly duration: number;
  /** Maximum number of stacks */
  readonly maxStacks: number;
  /** How the effect stacks when re-applied */
  readonly stackBehavior: StackBehaviorValue;
  /** true = harmful (red border), false = beneficial (green border) */
  readonly isDebuff: boolean;
  /** Stat modifiers keyed by stat name — base values for scaling */
  readonly statModifiers: Record<string, StatModifier>;
  /** Periodic tick effect (damage/heal over time), or null */
  readonly tickEffect: TickEffect | null;
  /** Scaling config — max values at t=1, or null if no scaling */
  readonly scaling: EffectScaling | null;
};

/** Strip server-only fields from an EffectDef for client consumption */
export function toEffectDefClient(def: EffectDef): EffectDefClient {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    isDebuff: def.isDebuff,
  };
}

/** Linear interpolation between base and max based on scaling factor t (0–1) */
export function lerpEffectValue(base: number, max: number | undefined, t: number): number {
  if (max === undefined || t <= 0) return base;
  return base + Math.min(t, 1) * (max - base);
}

/**
 * Compute a 0–1 scaling factor from a dungeon level within a [min, max] range.
 * @param maxLevel - 0 means unbounded (scales up to MAX_LEVEL)
 */
export function computeScalingFactor(
  dungeonLevel: number,
  minLevel: number,
  maxLevel: number,
  levelCap: number,
): number {
  const minLvl = Math.max(minLevel, 1);
  const maxLvl = maxLevel > 0 ? maxLevel : levelCap;
  if (maxLvl <= minLvl) return 0;
  return Math.min(1, Math.max(0, (dungeonLevel - minLvl) / (maxLvl - minLvl)));
}
