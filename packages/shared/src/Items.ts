/** Effect type for consumable items — each value maps to a handler on the server */
export const ItemEffectType = {
  /** No effect (non-consumable items) */
  NONE: "none",
  /** Restores health by effectParams.amount */
  HEAL: "heal",
} as const;
export type ItemEffectTypeValue = (typeof ItemEffectType)[keyof typeof ItemEffectType];

/** Item rarity — determines border color in the UI */
export const ItemRarity = {
  COMMON: "common",
  UNCOMMON: "uncommon",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
} as const;
export type ItemRarityValue = (typeof ItemRarity)[keyof typeof ItemRarity];

/** Presentation-only item info sent to the client */
export type ItemDefClient = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly consumable: boolean;
  readonly effectParams: Record<string, unknown>;
  readonly transient: boolean;
  readonly rarity: ItemRarityValue;
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
  /** Transient items are not persisted to DB (e.g. dungeon key) */
  readonly transient: boolean;
  readonly rarity: ItemRarityValue;
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
    transient: def.transient,
    rarity: def.rarity,
  };
}
