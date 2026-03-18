import type { EffectDef, StatModifier, TickEffect } from "@dungeon/shared";
import { effects } from "../db/schema.js";
import { createRegistry } from "../db/createRegistry.js";

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
  }),
  hashDef: (def) => {
    // Include all mutable fields so client detects any definition change
    const base = (def.duration * 100 + def.maxStacks) | 0;
    const modHash = JSON.stringify(def.statModifiers);
    let h = base;
    for (let i = 0; i < modHash.length; i++) {
      h = (h * 31 + modHash.charCodeAt(i)) | 0;
    }
    h = (h * 31 + (def.isDebuff ? 1 : 0)) | 0;
    h = (h * 31 + def.stackBehavior.charCodeAt(0)) | 0;
    return h;
  },
});

export const loadEffectRegistry = registry.load;
export const getEffectDef = registry.get;
export const getEffectDefs = registry.getMany;
export const getAllEffectDefs = registry.getAll;
export const getEffectRegistryVersion = registry.getVersion;
