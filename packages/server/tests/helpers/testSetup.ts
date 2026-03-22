/**
 * Test helpers for Colyseus integration tests.
 * Mocks DB and registries so tests run without PostgreSQL.
 */
import { mock } from "bun:test";
import { JWT } from "colyseus";
import { PROTOCOL_VERSION } from "@dungeon/shared";
import type { ItemDef, EffectDef } from "@dungeon/shared";
import { resolve } from "path";

// Silence "@colyseus/sdk: onMessage() not registered" warnings in tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("onMessage() not registered")) return;
  originalWarn.apply(console, args);
};

// Resolve absolute paths for mocking (Bun resolves imports to absolute paths)
const SRC = resolve(import.meta.dir, "../../src");
const m = (rel: string) => resolve(SRC, rel);

// ── Mock DB ──────────────────────────────────────────────────────────────────

// Chainable query mock that resolves to [] when awaited
const makeNoopQuery = (): any => {
  const chain: any = new Promise((r) => r([]));
  // Make it chainable AND thenable
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return chain[prop].bind(chain);
      }
      // Any chained method returns a new chainable proxy
      return (..._args: any[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
};

const fakeDb = {
  select: () => makeNoopQuery(),
  insert: () => makeNoopQuery(),
  delete: () => makeNoopQuery(),
  update: () => makeNoopQuery(),
  transaction: async (fn: (tx: any) => Promise<void>) => fn(fakeDb),
};

const dbMock = () => ({
  getDb: () => fakeDb,
  initDatabase: async () => fakeDb,
});
mock.module(m("db/database"), dbMock);
mock.module(m("db/database.js"), dbMock);
mock.module(m("db/database.ts"), dbMock);

// Mock DB schema
const schemaMock = () => {
  const mockTable = new Proxy({}, { get: (_target, prop) => ({ name: prop, table: "mock" }) });
  return {
    accounts: mockTable,
    characters: mockTable,
    characterInventory: mockTable,
    characterEquipment: mockTable,
    characterConsumableBar: mockTable,
    characterSkills: mockTable,
    characterTalents: mockTable,
    itemInstances: mockTable,
  };
};
mock.module(m("db/schema"), schemaMock);
mock.module(m("db/schema.js"), schemaMock);
mock.module(m("db/schema.ts"), schemaMock);

// ── Mock Registries ──────────────────────────────────────────────────────────

const TEST_WARRIOR_SCALING = {
  hpPerVit: 5,
  hpBase: 50,
  atkPerStr: 1,
  atkBase: 0,
  defPerAgi: 0.3,
  defBase: 0,
  speedPerAgi: 0.05,
  speedBase: 4.5,
  cdPerAgi: -0.01,
  cdBase: 1.1,
};

const itemRegistryMock = () => ({
  loadItemRegistry: async () => {},
  getItemDef: (_id: string): ItemDef | undefined => undefined,
  getAllItemDefs: () => [],
  getItemDefs: (_ids: string[]) => [],
  getItemDefsForClient: (_ids: string[]) => [],
  getItemRegistryVersion: () => 0,
});
mock.module(m("items/ItemRegistry"), itemRegistryMock);
mock.module(m("items/ItemRegistry.js"), itemRegistryMock);
mock.module(m("items/ItemRegistry.ts"), itemRegistryMock);

const skillRegistryMock = () => ({
  loadSkillRegistry: async () => {},
  getSkillDef: (_id: string) => undefined,
  getAllSkillDefs: () => [],
  getSkillDefs: (_ids: string[]) => [],
  getSkillRegistryVersion: () => 0,
});
mock.module(m("skills/SkillRegistry"), skillRegistryMock);
mock.module(m("skills/SkillRegistry.js"), skillRegistryMock);
mock.module(m("skills/SkillRegistry.ts"), skillRegistryMock);

const effectRegistryMock = () => ({
  loadEffectRegistry: async () => {},
  getEffectDef: (_id: string): EffectDef | undefined => undefined,
  getEffectDefs: (_ids: string[]) => [],
  getEffectDefsForClient: (_ids: string[]) => [],
  getEffectRegistryVersion: () => 0,
});
mock.module(m("effects/EffectRegistry"), effectRegistryMock);
mock.module(m("effects/EffectRegistry.js"), effectRegistryMock);
mock.module(m("effects/EffectRegistry.ts"), effectRegistryMock);

const MOCK_ZOMBIE = {
  id: "zombie",
  name: "creatures.zombie",
  skin: "zombie",
  baseStats: { strength: 8, vitality: 8, agility: 5 },
  overrides: {},
  detectionRange: 6,
  attackRange: 1.5,
  leashRange: 8,
  minLevel: 1,
  maxLevel: 0,
  isBoss: false,
};

const creatureRegistryMock = () => ({
  loadCreatureTypeRegistry: async () => {},
  getCreatureTypeDef: (_id: string) => MOCK_ZOMBIE,
  getCreatureTypesForLevel: () => [MOCK_ZOMBIE],
  getBossTypesForLevel: () => [],
  getCreatureLoot: () => [],
  getCreatureEffects: () => [],
  getCreatureSkills: () => [],
  getCreatureDefaultSkill: () => null,
});
mock.module(m("creatures/CreatureTypeRegistry"), creatureRegistryMock);
mock.module(m("creatures/CreatureTypeRegistry.js"), creatureRegistryMock);
mock.module(m("creatures/CreatureTypeRegistry.ts"), creatureRegistryMock);

const classRegistryMock = () => ({
  loadClassRegistry: async () => {},
  getClassDef: (_id: string) => ({
    id: "warrior",
    name: "classes.warrior",
    scaling: TEST_WARRIOR_SCALING,
    skills: [],
    defaultSkillId: "basic_attack",
  }),
  getClassDefaultSkill: () => "basic_attack",
  getClassDefs: (_ids: string[]) => [],
  getClassDefsForClient: (_ids: string[]) => [],
  getClassRegistryVersion: () => 0,
  getSkillsForLevel: () => [],
  syncAndNotifySkills: () => {},
  syncSkillsForLevel: () => [],
});
mock.module(m("classes/ClassRegistry"), classRegistryMock);
mock.module(m("classes/ClassRegistry.js"), classRegistryMock);
mock.module(m("classes/ClassRegistry.ts"), classRegistryMock);

const talentRegistryMock = () => ({
  loadTalentRegistry: async () => {},
  getTalentDef: (_id: string) => undefined,
  getTalentsForClass: () => [],
  collectTalentStatMods: () => [],
  collectTalentSkillMods: (_allocs: any, _skillId: string) => ({ cooldownMul: 1, damageMul: 1 }),
  getTalentDefs: (_ids: string[]) => [],
  getTalentDefsForClient: (_ids: string[]) => [],
  getTalentRegistryVersion: () => 0,
});
mock.module(m("talents/TalentRegistry"), talentRegistryMock);
mock.module(m("talents/TalentRegistry.js"), talentRegistryMock);
mock.module(m("talents/TalentRegistry.ts"), talentRegistryMock);

// Mock item instance registry (in-memory cache, no DB)
const itemInstanceMock = () => {
  const cache = new Map<string, any>();
  return {
    getInstance: (id: string) => cache.get(id),
    registerInstance: (inst: any) => cache.set(inst.id, inst),
    createInstanceInMemory: (itemId: string, rolledStats: any, itemLevel: number) => {
      const inst = { id: crypto.randomUUID(), itemId, rolledStats, itemLevel };
      cache.set(inst.id, inst);
      return inst;
    },
    cacheInstances: (instances: any[]) => {
      for (const inst of instances) cache.set(inst.id, inst);
    },
    evictInstances: (ids: string[]) => {
      for (const id of ids) cache.delete(id);
    },
    savePendingInstancesTx: async () => {},
    deleteInstanceFromDb: async (id: string) => cache.delete(id),
  };
};
mock.module(m("items/ItemInstanceRegistry"), itemInstanceMock);
mock.module(m("items/ItemInstanceRegistry.js"), itemInstanceMock);
mock.module(m("items/ItemInstanceRegistry.ts"), itemInstanceMock);

// Mock auth config (side-effect import)
mock.module(m("auth/authConfig"), () => ({}));
mock.module(m("auth/authConfig.js"), () => ({}));
mock.module(m("auth/authConfig.ts"), () => ({}));

// ── JWT Helper ───────────────────────────────────────────────────────────────

JWT.settings.secret = "test-secret-for-integration-tests";

export async function generateTestToken(
  accountId = "test-account-1",
  email = "test@example.com",
  role = "user",
): Promise<string> {
  return JWT.sign({ accountId, email, role });
}

export function defaultConnectOptions(token: string) {
  return { protocolVersion: PROTOCOL_VERSION, token };
}
