import type { ItemDef, ItemDefClient, ItemRarityValue } from "@dungeon/shared";
import { toItemDefClient } from "@dungeon/shared";
import { items } from "../db/schema.js";
import { createRegistry } from "../db/createRegistry.js";

type ItemRow = typeof items.$inferSelect;

const registry = createRegistry<ItemRow, ItemDef>({
  table: items,
  name: "ItemRegistry",
  mapRow: (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    maxStack: row.maxStack,
    consumable: row.consumable,
    cooldown: row.cooldown,
    effectType: row.effectType,
    effectParams: row.effectParams as Record<string, unknown>,
    useSound: row.useSound,
    transient: row.transient,
    rarity: row.rarity as ItemRarityValue,
  }),
  hashDef: (def) => ((def.maxStack << 16) + def.cooldown * 100) | 0,
});

export const loadItemRegistry = registry.load;
export const getItemDef = registry.get;
export const getItemDefs = registry.getMany;
export const getAllItemDefs = registry.getAll;
export const getItemRegistryVersion = registry.getVersion;

/** Return only presentation fields for client consumption */
export function getItemDefsForClient(ids: string[]): ItemDefClient[] {
  return registry.getMany(ids).map(toItemDefClient);
}
