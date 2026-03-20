import type {
  CreatureTypeDefinition,
  CreatureLootEntry,
  DerivedStats,
  CreatureEffectTriggerValue,
  EffectScaling,
} from "@dungeon/shared";
import { creatures, creatureLoot, creatureEffects, creatureSkills } from "../db/schema.js";
import { getSkillDef } from "../skills/SkillRegistry.js";
import { getItemDef } from "../items/ItemRegistry.js";
import { getEffectDef } from "../effects/EffectRegistry.js";
import type { SkillDef } from "@dungeon/shared";
import { createRegistry, simpleHash } from "../db/createRegistry.js";
import { getDb } from "../db/database.js";
import { logger } from "../logger.js";

export type CreatureEffectEntry = {
  trigger: CreatureEffectTriggerValue;
  effectId: string;
  chance: number;
  stacks: number;
  minLevel: number;
  maxLevel: number;
  maxChance: number | null;
  scalingOverride: EffectScaling | null;
};

type CreatureRow = typeof creatures.$inferSelect;

export type CreatureSkillEntry = {
  skillId: string;
  isDefault: boolean;
  def: SkillDef;
};

/** Pre-loaded related data — populated before registry.load() */
let lootByCreature = new Map<string, CreatureLootEntry[]>();
let effectsByCreature = new Map<string, CreatureEffectEntry[]>();
let skillsByCreature = new Map<string, CreatureSkillEntry[]>();

const registry = createRegistry<CreatureRow, CreatureTypeDefinition>({
  table: creatures,
  name: "CreatureTypeRegistry",
  mapRow: (row) => {
    const overrides: Partial<DerivedStats> = {};
    if (row.overrideMaxHealth !== null) overrides.maxHealth = row.overrideMaxHealth;
    if (row.overrideMoveSpeed !== null) overrides.moveSpeed = row.overrideMoveSpeed;
    if (row.overrideAttackCooldown !== null) overrides.attackCooldown = row.overrideAttackCooldown;
    if (row.overrideAttackDamage !== null) overrides.attackDamage = row.overrideAttackDamage;
    if (row.overrideDefense !== null) overrides.defense = row.overrideDefense;

    return {
      id: row.id,
      name: row.name,
      baseStats: {
        strength: row.strength,
        vitality: row.vitality,
        agility: row.agility,
      },
      overrides,
      detectionRange: row.detectionRange,
      attackRange: row.attackRange,
      leashRange: row.leashRange,
      skin: row.skin,
      minLevel: row.minLevel,
      maxLevel: row.maxLevel,
      isBoss: row.isBoss,
    };
  },
  hashDef: (def) => simpleHash(JSON.stringify(def)),
});

export async function loadCreatureTypeRegistry(): Promise<void> {
  const db = getDb();

  // Pre-load creature loot
  const lootRows = await db.select().from(creatureLoot);
  lootByCreature = new Map<string, CreatureLootEntry[]>();
  for (const row of lootRows) {
    if (!getItemDef(row.itemId)) {
      logger.warn(
        { creatureId: row.creatureId, itemId: row.itemId },
        "Creature loot references unknown item — skipping",
      );
      continue;
    }
    const entries = lootByCreature.get(row.creatureId) ?? [];
    entries.push({
      itemId: row.itemId,
      dropChance: row.dropChance,
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
    });
    lootByCreature.set(row.creatureId, entries);
  }

  // Pre-load creature effects
  const effectRows = await db.select().from(creatureEffects);
  effectsByCreature = new Map<string, CreatureEffectEntry[]>();
  for (const row of effectRows) {
    if (!getEffectDef(row.effectId)) {
      logger.warn(
        { creatureId: row.creatureId, effectId: row.effectId },
        "Creature effect references unknown effect — skipping",
      );
      continue;
    }
    const entries = effectsByCreature.get(row.creatureId) ?? [];
    entries.push({
      trigger: row.trigger,
      effectId: row.effectId,
      chance: row.chance,
      stacks: row.stacks,
      minLevel: row.minLevel,
      maxLevel: row.maxLevel,
      maxChance: row.maxChance,
      scalingOverride: (row.scalingOverride as EffectScaling) ?? null,
    });
    effectsByCreature.set(row.creatureId, entries);
  }

  // Pre-load creature skills
  const skillRows = await db.select().from(creatureSkills);
  skillsByCreature = new Map<string, CreatureSkillEntry[]>();
  for (const row of skillRows) {
    const def = getSkillDef(row.skillId);
    if (!def) {
      logger.warn(
        { creatureId: row.creatureId, skillId: row.skillId },
        "Creature references unknown skill — skipping",
      );
      continue;
    }
    const entries = skillsByCreature.get(row.creatureId) ?? [];
    entries.push({ skillId: row.skillId, isDefault: row.isDefault, def });
    skillsByCreature.set(row.creatureId, entries);
  }

  await registry.load();
}

export const getCreatureTypeDef = registry.get;
export const getAllCreatureTypeDefs = registry.getAll;
export const getCreatureTypeRegistryVersion = registry.getVersion;

export function getCreatureTypesForLevel(level: number): CreatureTypeDefinition[] {
  const result: CreatureTypeDefinition[] = [];
  for (const def of registry.getAll()) {
    if (def.isBoss) continue; // Bosses are placed separately
    if (level >= def.minLevel && (def.maxLevel === 0 || level <= def.maxLevel)) {
      result.push(def);
    }
  }
  return result;
}

export function getBossTypesForLevel(level: number): CreatureTypeDefinition[] {
  const result: CreatureTypeDefinition[] = [];
  for (const def of registry.getAll()) {
    if (!def.isBoss) continue;
    if (level >= def.minLevel && (def.maxLevel === 0 || level <= def.maxLevel)) {
      result.push(def);
    }
  }
  return result;
}

export function getCreatureLoot(creatureTypeId: string): CreatureLootEntry[] {
  return lootByCreature.get(creatureTypeId) ?? [];
}

export function getCreatureEffects(creatureTypeId: string): CreatureEffectEntry[] {
  return effectsByCreature.get(creatureTypeId) ?? [];
}

export function getCreatureSkills(creatureTypeId: string): CreatureSkillEntry[] {
  return skillsByCreature.get(creatureTypeId) ?? [];
}

/** Get the default attack skill for a creature (fallback: "punch" anim, 1x damage) */
export function getCreatureDefaultSkill(creatureTypeId: string): CreatureSkillEntry | null {
  const skills = skillsByCreature.get(creatureTypeId);
  if (!skills || skills.length === 0) return null;
  return skills.find((s) => s.isDefault) ?? skills[0];
}
