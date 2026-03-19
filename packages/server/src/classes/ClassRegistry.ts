import type { ClassDef, ClassDefClient, StatScaling, SkillDef } from "@dungeon/shared";
import { toClassDefClient } from "@dungeon/shared";
import { classes, classSkills } from "../db/schema.js";
import { createRegistry, simpleHash } from "../db/createRegistry.js";
import { getDb } from "../db/database.js";
import { getSkillDef } from "../skills/SkillRegistry.js";

type ClassRow = typeof classes.$inferSelect;

/** Pre-loaded skill mappings — populated before registry.load() */
let skillsByClass = new Map<string, string[]>();
let defaultSkillByClass = new Map<string, SkillDef>();

const registry = createRegistry<ClassRow, ClassDef>({
  table: classes,
  name: "ClassRegistry",
  mapRow: (row) => {
    const scaling: StatScaling = {
      healthBase: row.hpBase,
      healthPerVit: row.hpPerVit,
      attackBase: row.attackBase,
      attackPerStr: row.attackPerStr,
      defenseBase: row.defenseBase,
      defensePerVit: row.defensePerVit,
      speedBase: row.speedBase,
      speedPerAgi: row.speedPerAgi,
      cooldownBase: row.cooldownBase,
      cooldownPerAgi: row.cooldownPerAgi,
      attackRange: row.attackRange,
    };

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      scaling,
      skillIds: skillsByClass.get(row.id) ?? [],
    };
  },
  hashDef: (def) => simpleHash(def.id + def.skillIds.join(",")),
});

export async function loadClassRegistry(): Promise<void> {
  // Pre-load class → skill mappings so mapRow can access them
  const db = getDb();
  const skillRows = await db.select().from(classSkills);
  skillsByClass = new Map<string, string[]>();
  defaultSkillByClass = new Map<string, SkillDef>();
  for (const row of skillRows) {
    const arr = skillsByClass.get(row.classId) ?? [];
    arr.push(row.skillId);
    skillsByClass.set(row.classId, arr);
    if (row.isDefault) {
      const def = getSkillDef(row.skillId);
      if (def) defaultSkillByClass.set(row.classId, def);
    }
  }

  await registry.load();
}

export const getClassDef = registry.get;
export const getClassDefs = registry.getMany;
export const getAllClassDefs = registry.getAll;
export const getClassRegistryVersion = registry.getVersion;

/** Return only presentation fields for client consumption */
export function getClassDefsForClient(ids: string[]): ClassDefClient[] {
  return registry.getMany(ids).map(toClassDefClient);
}

/** Get the default auto-attack skill for a class (fallback: "punch" anim, 1x damage) */
export function getClassDefaultSkill(classId: string): SkillDef | null {
  return defaultSkillByClass.get(classId) ?? null;
}
