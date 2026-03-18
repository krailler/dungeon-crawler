import type {
  EffectDef,
  EffectDefClient,
  EffectScaling,
  StatModifier,
  TickEffect,
} from "@dungeon/shared";
import { toEffectDefClient } from "@dungeon/shared";
import { effects } from "../db/schema.js";
import { createRegistry, simpleHash } from "../db/createRegistry.js";

type EffectRow = typeof effects.$inferSelect;

const registry = createRegistry<EffectRow, EffectDef>({
  table: effects,
  name: "EffectRegistry",
  mapRow: (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    duration: row.duration,
    maxStacks: row.maxStacks,
    stackBehavior: row.stackBehavior,
    isDebuff: row.isDebuff,
    statModifiers: (row.statModifiers ?? {}) as Record<string, StatModifier>,
    tickEffect: (row.tickEffect as TickEffect) ?? null,
    scaling: (row.scaling as EffectScaling) ?? null,
  }),
  hashDef: (def) => simpleHash(JSON.stringify(def)),
});

export const loadEffectRegistry = registry.load;
export const getEffectDef = registry.get;
export const getEffectDefs = registry.getMany;
export const getAllEffectDefs = registry.getAll;
export const getEffectRegistryVersion = registry.getVersion;

/** Return only presentation fields for client consumption */
export function getEffectDefsForClient(ids: string[]): EffectDefClient[] {
  return registry.getMany(ids).map(toEffectDefClient);
}
