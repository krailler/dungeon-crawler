import type { EquipmentSlotValue } from "./constants/items.js";

/** Effect type for consumable items — each value maps to a handler on the server */
export const ItemEffectType = {
  /** No effect (non-consumable items) */
  NONE: "none",
  /** Restores health by effectParams.amount */
  HEAL: "heal",
  /** Applies a buff/debuff effect by effectParams.effectId */
  APPLY_EFFECT: "apply_effect",
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

/** A single entry in an equipment template's bonus affix pool */
export type BonusPoolEntry = {
  readonly stat: string;
  readonly min: number;
  readonly max: number;
  /** Weight for weighted random selection (higher = more likely, 1-8) */
  readonly weight: number;
};

/** Stat range for equipment rolling — { min, max } for each guaranteed stat */
export type StatRange = {
  readonly min: number;
  readonly max: number;
};

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
  /** Equipment slot this item can be equipped in, or null if not equippable */
  readonly equipSlot: EquipmentSlotValue | null;
  /** Minimum character level to equip */
  readonly levelReq: number;
  /** Stat ranges for equipment (template ranges, not rolled values) */
  readonly statRanges: Record<string, StatRange>;
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
  /** Equipment slot this item can be equipped in, or null if not equippable */
  readonly equipSlot: EquipmentSlotValue | null;
  /** Minimum character level to equip */
  readonly levelReq: number;
  /** Guaranteed stat ranges for equipment rolling */
  readonly statRanges: Record<string, StatRange>;
  /** Pool of bonus affixes for equipment rolling */
  readonly bonusPool: readonly BonusPoolEntry[];
};

/** A unique item instance with rolled stats (created when equipment drops) */
export type ItemInstance = {
  readonly id: string;
  readonly itemId: string;
  readonly rolledStats: Record<string, number>;
  readonly itemLevel: number;
};

/** Client-facing item instance info */
export type ItemInstanceClient = {
  readonly id: string;
  readonly itemId: string;
  readonly rolledStats: Record<string, number>;
  readonly itemLevel: number;
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
    equipSlot: def.equipSlot,
    levelReq: def.levelReq,
    statRanges: def.statRanges,
  };
}
