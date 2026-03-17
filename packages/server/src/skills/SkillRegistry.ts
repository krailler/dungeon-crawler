import type { SkillDef } from "@dungeon/shared";
import { skills } from "../db/schema.js";
import { createRegistry } from "../db/createRegistry.js";

type SkillRow = typeof skills.$inferSelect;

const registry = createRegistry<SkillRow, SkillDef>({
  table: skills,
  name: "SkillRegistry",
  mapRow: (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    passive: row.passive,
    cooldown: row.cooldown,
    damageMultiplier: row.damageMultiplier,
    animState: row.animState,
  }),
  hashDef: (def) => (def.cooldown * 100 + def.damageMultiplier * 100) | 0,
});

export const loadSkillRegistry = registry.load;
export const getSkillDef = registry.get;
export const getSkillDefs = registry.getMany;
export const getAllSkillDefs = registry.getAll;
export const getSkillRegistryVersion = registry.getVersion;
