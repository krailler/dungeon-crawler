import type {
  TalentDef,
  TalentDefClient,
  TalentRankEffect,
  TalentEffectTypeValue,
  TalentStatModifier,
  StatModTypeValue,
} from "@dungeon/shared";
import { toTalentDefClient, TalentEffectType } from "@dungeon/shared";
import { talents, talentEffects } from "../db/schema.js";
import { createRegistry, simpleHash } from "../db/createRegistry.js";
import { getDb } from "../db/database.js";
import { logger } from "../logger.js";

type TalentRow = typeof talents.$inferSelect;

/** Pre-loaded talent rank effects — populated before registry.load() */
let effectsByTalent = new Map<string, TalentRankEffect[]>();

const registry = createRegistry<TalentRow, TalentDef>({
  table: talents,
  name: "TalentRegistry",
  mapRow: (row) => ({
    id: row.id,
    classId: row.classId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    maxRank: row.maxRank,
    requiredTalentId: row.requiredTalentId,
    requiredTalentRank: row.requiredTalentRank,
    requiredLevel: row.requiredLevel,
    row: row.row,
    col: row.col,
    effects: effectsByTalent.get(row.id) ?? [],
  }),
  hashDef: (def) => simpleHash(JSON.stringify(def)),
});

export async function loadTalentRegistry(): Promise<void> {
  const db = getDb();

  // Pre-load talent effects
  const rows = await db.select().from(talentEffects);
  effectsByTalent = new Map<string, TalentRankEffect[]>();
  for (const row of rows) {
    const entries = effectsByTalent.get(row.talentId) ?? [];
    const effect: TalentRankEffect = {
      rank: row.rank,
      effectType: row.effectType as TalentEffectTypeValue,
      ...(row.statName && row.statModType && row.statModValue !== null
        ? {
            statModifier: {
              stat: row.statName,
              type: row.statModType as StatModTypeValue,
              value: row.statModValue,
            },
          }
        : {}),
      ...(row.effectType === "unlock_skill" && row.skillId ? { skillId: row.skillId } : {}),
      ...(row.effectType === "modify_skill" && row.skillId
        ? {
            skillModifier: {
              skillId: row.skillId,
              ...(row.cooldownMul !== null ? { cooldownMul: row.cooldownMul } : {}),
              ...(row.damageMul !== null ? { damageMul: row.damageMul } : {}),
            },
          }
        : {}),
    };
    entries.push(effect);
    effectsByTalent.set(row.talentId, entries);
  }

  await registry.load();
}

export const getTalentDef = registry.get;
export const getTalentDefs = registry.getMany;
export const getAllTalentDefs = registry.getAll;
export const getTalentRegistryVersion = registry.getVersion;

/** Get all talents for a specific class */
export function getTalentsForClass(classId: string): TalentDef[] {
  return registry.getAll().filter((t) => t.classId === classId);
}

/** Return only presentation fields for client consumption */
export function getTalentDefsForClient(ids: string[]): TalentDefClient[] {
  return registry.getMany(ids).map(toTalentDefClient);
}

/**
 * Collect all passive stat modifiers granted by the player's allocated talents.
 * Each rank's modifier is included individually (ranks are cumulative).
 */
export function collectTalentStatMods(allocations: Map<string, number>): TalentStatModifier[] {
  const mods: TalentStatModifier[] = [];
  for (const [talentId, rank] of allocations) {
    const def = registry.get(talentId);
    if (!def) {
      logger.warn({ talentId }, "Player has allocated unknown talent — skipping");
      continue;
    }
    for (const effect of def.effects) {
      if (effect.rank > rank) continue;
      if (effect.effectType !== TalentEffectType.STAT_MOD || !effect.statModifier) continue;
      mods.push(effect.statModifier);
    }
  }
  return mods;
}

/**
 * Collect all skill modifiers for a specific skill from the player's allocated talents.
 * Returns aggregated cooldownMul and damageMul (multiplicative).
 */
export function collectTalentSkillMods(
  allocations: Map<string, number>,
  skillId: string,
): { cooldownMul: number; damageMul: number } {
  let cooldownMul = 1;
  let damageMul = 1;
  for (const [talentId, rank] of allocations) {
    const def = registry.get(talentId);
    if (!def) {
      logger.warn({ talentId }, "Player has allocated unknown talent — skipping");
      continue;
    }
    for (const effect of def.effects) {
      if (effect.rank > rank) continue;
      if (effect.effectType !== TalentEffectType.MODIFY_SKILL) continue;
      if (effect.skillModifier?.skillId !== skillId) continue;
      if (effect.skillModifier.cooldownMul) cooldownMul *= effect.skillModifier.cooldownMul;
      if (effect.skillModifier.damageMul) damageMul *= effect.skillModifier.damageMul;
    }
  }
  return { cooldownMul, damageMul };
}
