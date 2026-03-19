import type {
  ClassDef,
  ClassDefClient,
  ClassSkillEntry,
  StatScaling,
  SkillDef,
} from "@dungeon/shared";
import { toClassDefClient } from "@dungeon/shared";
import { classes, classSkills } from "../db/schema.js";
import { createRegistry, simpleHash } from "../db/createRegistry.js";
import { getDb } from "../db/database.js";
import { getSkillDef } from "../skills/SkillRegistry.js";

type ClassRow = typeof classes.$inferSelect;

/** Pre-loaded skill mappings — populated before registry.load() */
let skillsByClass = new Map<string, string[]>();
let defaultSkillByClass = new Map<string, SkillDef>();
/** classId → Map<level, skillId[]> — skills that unlock at each level */
let skillUnlocksByClass = new Map<string, Map<number, string[]>>();
/** classId → Map<skillId, unlockLevel> — unlock level per skill */
let skillUnlockLevels = new Map<string, Map<string, number>>();

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
  skillUnlocksByClass = new Map<string, Map<number, string[]>>();
  skillUnlockLevels = new Map<string, Map<string, number>>();
  for (const row of skillRows) {
    const arr = skillsByClass.get(row.classId) ?? [];
    arr.push(row.skillId);
    skillsByClass.set(row.classId, arr);
    if (row.isDefault) {
      const def = getSkillDef(row.skillId);
      if (def) defaultSkillByClass.set(row.classId, def);
    }
    // Track unlock levels
    let lvlMap = skillUnlockLevels.get(row.classId);
    if (!lvlMap) {
      lvlMap = new Map<string, number>();
      skillUnlockLevels.set(row.classId, lvlMap);
    }
    lvlMap.set(row.skillId, row.unlockLevel);

    // Index by level for fast lookup (skip level 1 — granted on creation)
    if (row.unlockLevel > 1) {
      let levelMap = skillUnlocksByClass.get(row.classId);
      if (!levelMap) {
        levelMap = new Map<number, string[]>();
        skillUnlocksByClass.set(row.classId, levelMap);
      }
      const skills = levelMap.get(row.unlockLevel) ?? [];
      skills.push(row.skillId);
      levelMap.set(row.unlockLevel, skills);
    }
  }

  await registry.load();
}

export const getClassDef = registry.get;
export const getClassDefs = registry.getMany;
export const getAllClassDefs = registry.getAll;
export const getClassRegistryVersion = registry.getVersion;

/** Build skill entries for client spellbook */
function buildSkillEntries(classId: string): ClassSkillEntry[] {
  const skillIds = skillsByClass.get(classId) ?? [];
  const lvlMap = skillUnlockLevels.get(classId);
  const defaultSkill = defaultSkillByClass.get(classId);
  return skillIds.map((skillId) => ({
    skillId,
    unlockLevel: lvlMap?.get(skillId) ?? 1,
    isDefault: defaultSkill?.id === skillId,
  }));
}

/** Return only presentation fields for client consumption */
export function getClassDefsForClient(ids: string[]): ClassDefClient[] {
  return registry.getMany(ids).map((def) => toClassDefClient(def, buildSkillEntries(def.id)));
}

/** Get the default auto-attack skill for a class (fallback: "punch" anim, 1x damage) */
export function getClassDefaultSkill(classId: string): SkillDef | null {
  return defaultSkillByClass.get(classId) ?? null;
}

/** Get all skill IDs available to a class at a given level (unlockLevel <= level). */
export function getSkillsForLevel(classId: string, level: number): string[] {
  const lvlMap = skillUnlockLevels.get(classId);
  if (!lvlMap) return [];
  const result: string[] = [];
  for (const [skillId, unlockLevel] of lvlMap) {
    if (unlockLevel <= level) result.push(skillId);
  }
  return result;
}

/** Skills array interface (matches Colyseus ArraySchema<string>). */
interface SkillArray {
  forEach(cb: (s: string, i: number) => void): void;
  push(s: string): unknown;
  splice(start: number, count: number): unknown;
}

/**
 * Sync a player's skill list to match their class + level.
 * Adds missing skills, removes over-level skills.
 * Returns the skill IDs that were newly added.
 */
/**
 * Sync skills for a level change and send chat notifications for newly unlocked skills.
 */
export function syncAndNotifySkills(
  classId: string,
  level: number,
  skills: SkillArray,
  sessionId: string,
  chatSystem: {
    sendSystemI18nTo(
      sid: string,
      key: string,
      params: Record<string, unknown>,
      fallback: string,
    ): void;
  },
): void {
  const newSkills = syncSkillsForLevel(classId, level, skills);
  for (const skillId of newSkills) {
    const sDef = getSkillDef(skillId);
    if (!sDef) continue;
    chatSystem.sendSystemI18nTo(
      sessionId,
      "chat.skillUnlocked",
      { skill: sDef.name },
      `New skill unlocked: ${skillId}!`,
    );
  }
}

export function syncSkillsForLevel(classId: string, level: number, skills: SkillArray): string[] {
  const expected = new Set(getSkillsForLevel(classId, level));

  // Remove skills above the target level
  const toRemove: number[] = [];
  skills.forEach((s: string, i: number) => {
    if (!expected.has(s)) toRemove.push(i);
  });
  for (let i = toRemove.length - 1; i >= 0; i--) {
    skills.splice(toRemove[i], 1);
  }

  // Add missing skills
  const current = new Set<string>();
  skills.forEach((s: string) => current.add(s));
  const added: string[] = [];
  for (const skillId of expected) {
    if (!current.has(skillId)) {
      skills.push(skillId);
      added.push(skillId);
    }
  }
  return added;
}
