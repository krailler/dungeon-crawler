import type { ItemInstance } from "@dungeon/shared";
import { getDb } from "../db/database.js";
import { itemInstances } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";

/**
 * In-memory cache of active item instances.
 * Instances are loaded from DB on player join and created on loot drops.
 */
const cache = new Map<string, ItemInstance>();

/** Pending instances created this session that need to be saved */
const pendingInserts = new Map<string, ItemInstance>();

export function getInstance(id: string): ItemInstance | undefined {
  return cache.get(id);
}

export function registerInstance(instance: ItemInstance): void {
  cache.set(instance.id, instance);
  pendingInserts.set(instance.id, instance);
}

export function createInstanceInMemory(
  itemId: string,
  rolledStats: Record<string, number>,
  itemLevel: number,
): ItemInstance {
  const instance: ItemInstance = {
    id: crypto.randomUUID(),
    itemId,
    rolledStats,
    itemLevel,
  };
  cache.set(instance.id, instance);
  pendingInserts.set(instance.id, instance);
  return instance;
}

export function deleteInstance(id: string): void {
  cache.delete(id);
  pendingInserts.delete(id);
}

/** Load instances for a character (from inventory + equipment) into cache */
export function cacheInstances(instances: ItemInstance[]): void {
  for (const inst of instances) {
    cache.set(inst.id, inst);
  }
}

/**
 * Save specific pending instances to DB within a transaction.
 * Only saves instances referenced by the given IDs (avoids clearing other players' pending data).
 */
export async function savePendingInstancesTx(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  instanceIds: string[],
): Promise<void> {
  const toSave = instanceIds
    .map((id) => pendingInserts.get(id))
    .filter((inst): inst is ItemInstance => inst != null);

  if (toSave.length === 0) return;

  const rows = toSave.map((inst) => ({
    id: inst.id,
    itemId: inst.itemId,
    rolledStats: inst.rolledStats,
    itemLevel: inst.itemLevel,
  }));

  await tx.insert(itemInstances).values(rows).onConflictDoNothing();

  // Only remove saved entries from pending
  for (const inst of toSave) {
    pendingInserts.delete(inst.id);
  }

  logger.debug({ count: rows.length }, "Saved pending item instances");
}

/** Delete an instance from DB */
export async function deleteInstanceFromDb(id: string): Promise<void> {
  const db = getDb();
  await db.delete(itemInstances).where(eq(itemInstances.id, id));
  cache.delete(id);
}
