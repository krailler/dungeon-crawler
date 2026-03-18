/** Trigger type for creature effect application */
export const CreatureEffectTrigger = {
  /** Applied when the creature lands a hit on a player */
  ON_HIT: "on_hit",
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

/** Effect definition loaded from the database at server startup */
export type EffectDef = {
  readonly id: string;
  /** i18n key for the effect name */
  readonly name: string;
  /** i18n key for the effect description */
  readonly description: string;
  /** Icon identifier (client maps to SVG component) */
  readonly icon: string;
  /** Duration in seconds */
  readonly duration: number;
  /** Maximum number of stacks */
  readonly maxStacks: number;
  /** How the effect stacks when re-applied */
  readonly stackBehavior: StackBehaviorValue;
  /** true = harmful (red border), false = beneficial (green border) */
  readonly isDebuff: boolean;
  /** Stat modifiers keyed by stat name (e.g. "attackDamage") */
  readonly statModifiers: Record<string, StatModifier>;
  /** Periodic tick effect (damage/heal over time), or null */
  readonly tickEffect: TickEffect | null;
};
