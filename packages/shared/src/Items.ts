/** Effect type for consumable items — each value maps to a handler on the server */
export const ItemEffectType = {
  /** No effect (non-consumable items) */
  NONE: "none",
  /** Restores health by effectParams.amount */
  HEAL: "heal",
} as const;
export type ItemEffectTypeValue = (typeof ItemEffectType)[keyof typeof ItemEffectType];

/** Item definition loaded from the database at server startup */
export type ItemDef = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly maxStack: number;
  readonly consumable: boolean;
  readonly cooldown: number;
  readonly effectType: ItemEffectTypeValue;
  readonly effectParams: Record<string, unknown>;
  /** Sound to play on the client when used successfully (empty = no sound). */
  readonly useSound: string;
};
