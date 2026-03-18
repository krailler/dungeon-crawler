/** Effect type for consumable items — each value maps to a handler on the server */
export const ItemEffectType = {
  /** No effect (non-consumable items) */
  NONE: "none",
  /** Restores health by effectParams.amount */
  HEAL: "heal",
} as const;
export type ItemEffectTypeValue = (typeof ItemEffectType)[keyof typeof ItemEffectType];

/** Presentation-only item info sent to the client */
export type ItemDefClient = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly consumable: boolean;
  readonly effectParams: Record<string, unknown>;
};

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

/** Strip server-only fields from an ItemDef for client consumption */
export function toItemDefClient(def: ItemDef): ItemDefClient {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    consumable: def.consumable,
    effectParams: def.effectParams,
  };
}
