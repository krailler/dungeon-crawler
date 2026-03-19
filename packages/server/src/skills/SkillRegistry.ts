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
    hpThreshold: row.hpThreshold,
    resetOnKill: row.resetOnKill,
    effectId: row.effectId,
    aoeRange: row.aoeRange,
  }),
  hashDef: (def) =>
    (def.cooldown * 100 +
      def.damageMultiplier * 100 +
      def.hpThreshold * 100 +
      def.aoeRange * 10 +
      (def.resetOnKill ? 1 : 0)) |
    0,
});

export const loadSkillRegistry = registry.load;
export const getSkillDef = registry.get;
export const getSkillDefs = registry.getMany;
export const getAllSkillDefs = registry.getAll;
export const getSkillRegistryVersion = registry.getVersion;
