import type {
  CreatureTypeDefinition,
  CreatureLootEntry,
  DerivedStats,
  CreatureEffectTriggerValue,
  EffectScaling,
} from "@dungeon/shared";
import { creatures, creatureLoot, creatureEffects } from "../db/schema";
import { getDb } from "../db/database";
import { logger } from "../logger";

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

const typeMap = new Map<string, CreatureTypeDefinition>();
const lootMap = new Map<string, CreatureLootEntry[]>();
const effectsMap = new Map<string, CreatureEffectEntry[]>();

export async function loadCreatureTypeRegistry(): Promise<void> {
  const db = getDb();

  // Load creature types
  const typeRows = await db.select().from(creatures);
  typeMap.clear();
  for (const row of typeRows) {
    const overrides: Partial<DerivedStats> = {};
    if (row.overrideMaxHealth !== null) overrides.maxHealth = row.overrideMaxHealth;
    if (row.overrideMoveSpeed !== null) overrides.moveSpeed = row.overrideMoveSpeed;
    if (row.overrideAttackCooldown !== null) overrides.attackCooldown = row.overrideAttackCooldown;
    if (row.overrideAttackDamage !== null) overrides.attackDamage = row.overrideAttackDamage;
    if (row.overrideDefense !== null) overrides.defense = row.overrideDefense;

    typeMap.set(row.id, {
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
    });
  }

  // Load creature loot
  const lootRows = await db.select().from(creatureLoot);
  lootMap.clear();
  for (const row of lootRows) {
    const entries = lootMap.get(row.creatureId) ?? [];
    entries.push({
      itemId: row.itemId,
      dropChance: row.dropChance,
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
    });
    lootMap.set(row.creatureId, entries);
  }

  // Load creature effects
  const effectRows = await db.select().from(creatureEffects);
  effectsMap.clear();
  for (const row of effectRows) {
    const entries = effectsMap.get(row.creatureId) ?? [];
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
    effectsMap.set(row.creatureId, entries);
  }

  logger.info(
    `CreatureTypeRegistry loaded ${typeMap.size} creature type(s), ${lootRows.length} loot entry(ies), ${effectRows.length} effect(s)`,
  );
}

export function getCreatureTypeDef(id: string): CreatureTypeDefinition | undefined {
  return typeMap.get(id);
}

export function getCreatureTypesForLevel(level: number): CreatureTypeDefinition[] {
  const result: CreatureTypeDefinition[] = [];
  for (const def of typeMap.values()) {
    if (level >= def.minLevel && (def.maxLevel === 0 || level <= def.maxLevel)) {
      result.push(def);
    }
  }
  return result;
}

export function getCreatureLoot(creatureTypeId: string): CreatureLootEntry[] {
  return lootMap.get(creatureTypeId) ?? [];
}

export function getCreatureEffects(creatureTypeId: string): CreatureEffectEntry[] {
  return effectsMap.get(creatureTypeId) ?? [];
}
