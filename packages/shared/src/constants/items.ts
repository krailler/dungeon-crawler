// Inventory
export const INVENTORY_MAX_SLOTS = 12;

// Consumable bar
export const MAX_CONSUMABLE_BAR_SLOTS = 4;

// Equipment
export const EQUIPMENT_SLOTS = {
  WEAPON: "weapon",
  HEAD: "head",
  CHEST: "chest",
  BOOTS: "boots",
  ACCESSORY_1: "accessory_1",
  ACCESSORY_2: "accessory_2",
} as const;
export type EquipmentSlotValue = (typeof EQUIPMENT_SLOTS)[keyof typeof EQUIPMENT_SLOTS];

export const MAX_EQUIPMENT_SLOTS = 6;

/** Number of bonus affixes rolled per rarity */
export const BONUS_AFFIXES_BY_RARITY: Record<string, { min: number; max: number }> = {
  common: { min: 0, max: 0 },
  uncommon: { min: 1, max: 1 },
  rare: { min: 1, max: 2 },
  epic: { min: 2, max: 3 },
  legendary: { min: 2, max: 3 },
};

/** Integer stats that should be rounded after rolling */
export const INTEGER_STATS = new Set([
  "strength",
  "vitality",
  "agility",
  "maxHealth",
  "attackDamage",
  "defense",
]);
