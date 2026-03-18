import type {
  CreatureTypeDefinition,
  CreatureLootEntry,
  DerivedStats,
  CreatureEffectTriggerValue,
  EffectScaling,
} from "@dungeon/shared";
import { creatures, creatureLoot, creatureEffects } from "../db/schema.js";
import { createRegistry, simpleHash } from "../db/createRegistry.js";
import { getDb } from "../db/database.js";

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

/** Pre-loaded related data — populated before registry.load() */
let lootByCreature = new Map<string, CreatureLootEntry[]>();
let effectsByCreature = new Map<string, CreatureEffectEntry[]>();

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

  await registry.load();
}

export const getCreatureTypeDef = registry.get;
export const getAllCreatureTypeDefs = registry.getAll;
export const getCreatureTypeRegistryVersion = registry.getVersion;

export function getCreatureTypesForLevel(level: number): CreatureTypeDefinition[] {
  const result: CreatureTypeDefinition[] = [];
  for (const def of registry.getAll()) {
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
