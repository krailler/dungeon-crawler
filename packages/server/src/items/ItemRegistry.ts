import type { ItemDef } from "@dungeon/shared";
import { items } from "../db/schema";
import { getDb } from "../db/database";
import { logger } from "../logger";

const registry = new Map<string, ItemDef>();
let registryVersion = 0;

export async function loadItemRegistry(): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(items);

  registry.clear();
  for (const row of rows) {
    registry.set(row.id, {
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
    });
  }

  // Simple version: hash of all ids + a timestamp-based seed
  // Changes every time the server restarts and reloads from DB
  let hash = 0;
  for (const [id, def] of registry) {
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    hash = ((hash << 5) - hash + def.maxStack) | 0;
    hash = ((hash << 5) - hash + def.cooldown) | 0;
  }
  registryVersion = hash >>> 0; // unsigned 32-bit

  logger.info(`ItemRegistry loaded ${registry.size} item(s), version=${registryVersion}`);
}

export function getItemDef(id: string): ItemDef | undefined {
  return registry.get(id);
}

export function getItemDefs(ids: string[]): ItemDef[] {
  const result: ItemDef[] = [];
  for (const id of ids) {
    const def = registry.get(id);
    if (def) result.push(def);
  }
  return result;
}

export function getAllItemDefs(): ItemDef[] {
  return Array.from(registry.values());
}

export function getItemRegistryVersion(): number {
  return registryVersion;
}
