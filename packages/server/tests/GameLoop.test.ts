import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  LifeState,
  MessageType,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_REGEN_DELAY,
  SPRINT_SPEED_MULTIPLIER,
  BLEEDOUT_DURATION,
  RESPAWN_BASE_TIME,
  RESPAWN_TIME_INCREMENT,
  RESPAWN_MAX_TIME,
  REVIVE_CHANNEL_DURATION,
  REVIVE_HP_PERCENT,
  PLAYER_WAYPOINT_THRESHOLD,
} from "@dungeon/shared";

// ── Module mocks (MUST be before GameLoop import) ───────────────────────────

let mockCreatureTypeDef: any = null;
let mockCreatureLoot: any[] = [];
let mockCreatureEffects: any[] = [];
let mockEffectDefs: Map<string, any> = new Map();
let mockItemDefs: Map<string, any> = new Map();
let mockRolledEquipment: any = null;
let mockSkillDefs: Map<string, any> = new Map();

mock.module("../src/creatures/CreatureTypeRegistry.js", () => ({
  getCreatureTypeDef: () => mockCreatureTypeDef,
  getCreatureLoot: () => mockCreatureLoot,
  getCreatureEffects: () => mockCreatureEffects,
}));

mock.module("../src/effects/EffectRegistry.js", () => ({
  getEffectDef: (id: string) => mockEffectDefs.get(id) ?? null,
}));

mock.module("../src/items/ItemRegistry.js", () => ({
  getItemDef: (id: string) => mockItemDefs.get(id) ?? null,
}));

mock.module("../src/items/LootRoller.js", () => ({
  rollEquipmentDrop: () => mockRolledEquipment ?? { id: "inst_1", rolledStats: {} },
}));

mock.module("../src/skills/SkillRegistry.js", () => ({
  getSkillDef: (id: string) => mockSkillDefs.get(id) ?? null,
}));

mock.module("../src/classes/ClassRegistry.js", () => ({
  syncAndNotifySkills: () => {},
}));

mock.module("../src/chat/notifyLevelProgress.js", () => ({
  notifyLevelProgress: () => {},
}));

mock.module("../src/logger.js", () => ({
  logger: {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ── Import AFTER mocks ──────────────────────────────────────────────────────

import { GameLoop } from "../src/systems/GameLoop.js";
import type { GameLoopBridge } from "../src/systems/GameLoop.js";
import { PlayerState } from "../src/state/PlayerState.js";
import { CreatureState } from "../src/state/CreatureState.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a MapSchema-like object backed by a real Map. */
function createMapSchema<T>(): Map<string, T> & { forEach: Map<string, T>["forEach"] } {
  return new Map<string, T>();
}

function createMockState() {
  const players = createMapSchema<PlayerState>();
  const creatures = createMapSchema<CreatureState>();
  const lootBags = createMapSchema<any>();
  return {
    players,
    creatures,
    lootBags,
    tickRate: 0,
    dungeonSeed: 42,
    serverRuntime: "test",
    dungeonLevel: 1,
  };
}

function createMockBridge(stateOverride?: ReturnType<typeof createMockState>): {
  bridge: GameLoopBridge;
  state: ReturnType<typeof createMockState>;
  calls: Record<string, any[]>;
} {
  const state = stateOverride ?? createMockState();
  const calls: Record<string, any[]> = {
    sendToClient: [],
    broadcastToAdmins: [],
    aiUpdate: [],
    combatUpdate: [],
    effectUpdate: [],
    effectApply: [],
    effectClear: [],
    effectRecompute: [],
    combatClearCooldowns: [],
    combatClearTargetFor: [],
    chatBroadcastSystem: [],
    chatBroadcastAnnouncement: [],
    onCreatureRemoved: [],
    onPlayerDowned: [],
    onItemDropped: [],
    aiAddThreat: [],
    aiUnregister: [],
    questTick: [],
    questCreatureKilled: [],
    questCreatureHit: [],
    questPlayerDied: [],
  };

  const bridge: GameLoopBridge = {
    state: state as any,
    aiSystem: {
      update: (dt: number, players: any, onDamage: any, onHit: any) => {
        calls.aiUpdate.push({ dt, players, onDamage, onHit });
      },
      addThreat: (creatureId: string, sessionId: string, amount: number) => {
        calls.aiAddThreat.push({ creatureId, sessionId, amount });
      },
      unregister: (creatureId: string) => {
        calls.aiUnregister.push(creatureId);
      },
    } as any,
    combatSystem: {
      update: (dt: number, players: any, creatures: any, onHit: any, onNotFacing: any) => {
        calls.combatUpdate.push({ dt, players, creatures, onHit, onNotFacing });
      },
      getTarget: () => null,
      setTarget: () => {},
      clearTargetFor: (creatureId: string) => {
        calls.combatClearTargetFor.push(creatureId);
      },
      clearCooldowns: (sessionId: string) => {
        calls.combatClearCooldowns.push(sessionId);
      },
    } as any,
    effectSystem: {
      update: (dt: number, players: any) => {
        calls.effectUpdate.push({ dt, players });
      },
      applyEffect: (...args: any[]) => {
        calls.effectApply.push(args);
      },
      clearEffects: (player: any) => {
        calls.effectClear.push(player);
      },
      recomputeStats: (player: any) => {
        calls.effectRecompute.push(player);
      },
    } as any,
    chatSystem: {
      broadcastSystemI18n: (...args: any[]) => {
        calls.chatBroadcastSystem.push(args);
      },
      broadcastAnnouncement: (...args: any[]) => {
        calls.chatBroadcastAnnouncement.push(args);
      },
    } as any,
    tileMap: {} as any,
    pathfinder: {
      findPath: () => [],
      isWalkable: () => true,
    } as any,
    tickRateTarget: 32,
    broadcastToAdmins: (type: string, message: unknown) => {
      calls.broadcastToAdmins.push({ type, message });
    },
    sendToClient: (sessionId: string, type: string, message: unknown) => {
      calls.sendToClient.push({ sessionId, type, message });
    },
    clock: {
      setTimeout: (fn: Function, _ms: number) => {
        fn();
        return {} as any;
      },
    } as any,
    onCreatureRemoved: (creatureId: string) => {
      calls.onCreatureRemoved.push(creatureId);
    },
    getSpawnPoint: () => ({ x: 5, z: 5 }),
    hasPlayerTarget: () => false,
    onPlayerDowned: () => {
      calls.onPlayerDowned.push(true);
    },
    onItemDropped: (itemId: string, rarity: string) => {
      calls.onItemDropped.push({ itemId, rarity });
    },
    questSystem: {
      tick: (dt: number) => calls.questTick.push(dt),
      onCreatureKilled: (type: string) => calls.questCreatureKilled.push(type),
      onCreatureHit: (type: string) => calls.questCreatureHit.push(type),
      onPlayerDied: () => calls.questPlayerDied.push(true),
    } as any,
  };

  return { bridge, state, calls };
}

function makePlayer(overrides: Partial<Record<string, any>> = {}): PlayerState {
  const p = new PlayerState();
  p.x = overrides.x ?? 5;
  p.z = overrides.z ?? 5;
  p.rotY = overrides.rotY ?? 0;
  p.lifeState = overrides.lifeState ?? LifeState.ALIVE;
  p.health = overrides.health ?? 100;
  p.maxHealth = overrides.maxHealth ?? 100;
  p.level = overrides.level ?? 1;
  p.speed = overrides.speed ?? 5;
  p.attackDamage = overrides.attackDamage ?? 10;
  p.defense = overrides.defense ?? 2;
  p.attackCooldown = overrides.attackCooldown ?? 1;
  p.attackRange = overrides.attackRange ?? 2.5;
  p.stamina = overrides.stamina ?? STAMINA_MAX;
  p.isMoving = overrides.isMoving ?? false;
  p.isSprinting = overrides.isSprinting ?? false;
  p.sprintRequested = overrides.sprintRequested ?? false;
  p.characterName = overrides.characterName ?? "TestHero";
  p.online = true;
  p.gold = overrides.gold ?? 0;
  p.xp = overrides.xp ?? 0;
  p.xpToNext = overrides.xpToNext ?? 50;
  p.classId = overrides.classId ?? "warrior";
  return p;
}

function makeCreature(overrides: Partial<Record<string, any>> = {}): CreatureState {
  const c = new CreatureState();
  c.x = overrides.x ?? 10;
  c.z = overrides.z ?? 10;
  c.health = overrides.health ?? 50;
  c.maxHealth = overrides.maxHealth ?? 50;
  c.isDead = overrides.isDead ?? false;
  c.creatureType = overrides.creatureType ?? "zombie";
  c.level = overrides.level ?? 1;
  c.speed = overrides.speed ?? 3;
  c.baseSpeed = overrides.baseSpeed ?? 3;
  c.attackDamage = overrides.attackDamage ?? 5;
  c.defense = overrides.defense ?? 1;
  return c;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("GameLoop", () => {
  let gameLoop: GameLoop;
  let bridge: GameLoopBridge;
  let state: ReturnType<typeof createMockState>;
  let calls: Record<string, any[]>;

  beforeEach(() => {
    // Reset module-level mock data
    mockCreatureTypeDef = null;
    mockCreatureLoot = [];
    mockCreatureEffects = [];
    mockEffectDefs = new Map();
    mockItemDefs = new Map();
    mockRolledEquipment = null;
    mockSkillDefs = new Map();

    const mocks = createMockBridge();
    bridge = mocks.bridge;
    state = mocks.state;
    calls = mocks.calls;
    gameLoop = new GameLoop(bridge);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Stamina
  // ────────────────────────────────────────────────────────────────────────
  describe("updateStamina (via update)", () => {
    it("drains stamina when sprinting and moving", () => {
      const player = makePlayer({
        sprintRequested: true,
        isMoving: true,
        stamina: STAMINA_MAX,
      });
      state.players.set("s1", player);

      // 1 second tick
      gameLoop.update(1000);

      expect(player.stamina).toBeCloseTo(STAMINA_MAX - STAMINA_DRAIN_PER_SEC, 1);
      expect(player.isSprinting).toBe(true);
    });

    it("stops sprinting when stamina depleted", () => {
      const player = makePlayer({
        sprintRequested: true,
        isMoving: true,
        stamina: 5,
      });
      state.players.set("s1", player);

      // 1 second tick drains 20, so 5 goes to 0
      gameLoop.update(1000);

      expect(player.stamina).toBe(0);
      expect(player.isSprinting).toBe(false);
    });

    it("does not drain stamina when not moving even if sprint requested", () => {
      const player = makePlayer({
        sprintRequested: true,
        isMoving: false,
        stamina: STAMINA_MAX,
      });
      state.players.set("s1", player);

      gameLoop.update(1000);

      // Not moving => not sprinting => no drain, regen delay ticks
      expect(player.isSprinting).toBe(false);
      expect(player.stamina).toBe(STAMINA_MAX);
    });

    it("regenerates stamina after regen delay", () => {
      const player = makePlayer({
        sprintRequested: false,
        isMoving: false,
        stamina: 50,
        staminaRegenDelay: 0,
      });
      player.staminaRegenDelay = 0;
      state.players.set("s1", player);

      // 1 second tick, regen delay already at 0
      gameLoop.update(1000);

      expect(player.stamina).toBeCloseTo(50 + STAMINA_REGEN_PER_SEC, 1);
    });

    it("caps stamina at STAMINA_MAX", () => {
      const player = makePlayer({
        sprintRequested: false,
        isMoving: false,
        stamina: 95,
      });
      player.staminaRegenDelay = 0;
      state.players.set("s1", player);

      // 1 second would regen 10, but capped at 100
      gameLoop.update(1000);

      expect(player.stamina).toBe(STAMINA_MAX);
    });

    it("ticks regen delay before regenerating", () => {
      const player = makePlayer({
        sprintRequested: false,
        isMoving: false,
        stamina: 50,
      });
      player.staminaRegenDelay = STAMINA_REGEN_DELAY;
      state.players.set("s1", player);

      // 0.5s tick — delay goes from 1.0 to 0.5, no regen yet
      gameLoop.update(500);

      expect(player.stamina).toBe(50);
      expect(player.staminaRegenDelay).toBeCloseTo(0.5, 2);
    });

    it("disables sprint on dead player", () => {
      const player = makePlayer({
        lifeState: LifeState.DEAD,
        sprintRequested: true,
        isSprinting: true,
        stamina: 100,
      });
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.isSprinting).toBe(false);
      expect(player.sprintRequested).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Item cooldowns
  // ────────────────────────────────────────────────────────────────────────
  describe("tickItemCooldowns (via update)", () => {
    it("ticks down item cooldowns", () => {
      const player = makePlayer();
      player.itemCooldowns.set("potion", 5);
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.itemCooldowns.get("potion")).toBeCloseTo(4, 1);
    });

    it("removes expired cooldowns", () => {
      const player = makePlayer();
      player.itemCooldowns.set("potion", 0.5);
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.itemCooldowns.has("potion")).toBe(false);
    });

    it("handles multiple cooldowns independently", () => {
      const player = makePlayer();
      player.itemCooldowns.set("potion", 3);
      player.itemCooldowns.set("scroll", 0.5);
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.itemCooldowns.has("scroll")).toBe(false);
      expect(player.itemCooldowns.get("potion")).toBeCloseTo(2, 1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Life states
  // ────────────────────────────────────────────────────────────────────────
  describe("updateLifeStates (via update)", () => {
    it("ticks bleed timer for downed player", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED });
      player.bleedTimer = BLEEDOUT_DURATION;
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.bleedTimer).toBeCloseTo(BLEEDOUT_DURATION - 1, 1);
      expect(player.lifeState).toBe(LifeState.DOWNED);
    });

    it("transitions downed to dead when bleed timer expires", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED });
      player.bleedTimer = 0.5;
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.lifeState).toBe(LifeState.DEAD);
      expect(player.bleedTimer).toBe(0);
      expect(player.respawnTimer).toBeGreaterThan(0);
    });

    it("calculates respawn timer with escalation", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED });
      player.bleedTimer = 0.1;
      player.deathCount = 2;
      state.players.set("s1", player);

      gameLoop.update(1000);

      // RESPAWN_BASE_TIME(5) + 2 * RESPAWN_TIME_INCREMENT(5) = 15
      expect(player.respawnTimer).toBe(
        Math.min(RESPAWN_BASE_TIME + 2 * RESPAWN_TIME_INCREMENT, RESPAWN_MAX_TIME),
      );
      expect(player.deathCount).toBe(3);
    });

    it("caps respawn timer at RESPAWN_MAX_TIME", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED });
      player.bleedTimer = 0.1;
      player.deathCount = 100;
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.respawnTimer).toBe(RESPAWN_MAX_TIME);
    });

    it("ticks respawn timer for dead player", () => {
      const player = makePlayer({ lifeState: LifeState.DEAD });
      player.respawnTimer = 10;
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.respawnTimer).toBeCloseTo(9, 1);
      expect(player.lifeState).toBe(LifeState.DEAD);
    });

    it("respawns dead player when timer expires", () => {
      const player = makePlayer({ lifeState: LifeState.DEAD, maxHealth: 100 });
      player.respawnTimer = 0.5;
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(player.lifeState).toBe(LifeState.ALIVE);
      expect(player.health).toBe(100);
      expect(player.x).toBe(5); // spawn point
      expect(player.z).toBe(5);
    });

    it("progresses revive channel on downed player", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0;
      reviver.isMoving = false;
      reviver.animState = "";

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      // 1 second tick: progress += 1 / 3.5
      gameLoop.update(1000);

      expect(target.reviveProgress).toBeCloseTo(1 / REVIVE_CHANNEL_DURATION, 2);
      // Bleed timer should NOT tick (paused during revive)
      expect(target.bleedTimer).toBe(BLEEDOUT_DURATION);
    });

    it("completes revive at full progress", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      const target = makePlayer({
        lifeState: LifeState.DOWNED,
        x: 5,
        z: 6,
        maxHealth: 100,
      });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      // Set progress just under 1.0 so a big enough tick completes it
      target.reviveProgress = 0.95;
      reviver.isMoving = false;
      reviver.animState = "";

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      // 1 second tick finishes it (0.95 + 1/3.5 > 1.0)
      gameLoop.update(1000);

      expect(target.lifeState).toBe(LifeState.ALIVE);
      expect(target.health).toBe(Math.max(1, Math.floor(100 * REVIVE_HP_PERCENT)));
      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
    });

    it("cancels revive if reviver moves", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = true; // moving!
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0.5;

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      gameLoop.update(1000);

      // Revive cancelled
      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
      // Bleed timer should tick since revive was cancelled
      expect(target.bleedTimer).toBeLessThan(BLEEDOUT_DURATION);
    });

    it("cancels revive if reviver dies", () => {
      const reviver = makePlayer({ x: 5, z: 5, lifeState: LifeState.DEAD });
      reviver.animState = "";
      reviver.respawnTimer = 999; // prevent respawn during this tick
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0.5;

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      gameLoop.update(1000);

      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
    });

    it("cancels revive if reviver out of range", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "";
      // Target far away
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 100, z: 100 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0.5;

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      gameLoop.update(1000);

      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
    });

    it("cancels revive if reviver has animState (attacking)", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "punch"; // attacking!
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0.5;

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      gameLoop.update(1000);

      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // killPlayer
  // ────────────────────────────────────────────────────────────────────────
  describe("killPlayer", () => {
    it("transitions an alive player to downed with 0 health", () => {
      const player = makePlayer({ health: 100 });
      state.players.set("s1", player);

      gameLoop.killPlayer("s1");

      expect(player.health).toBe(0);
      expect(player.lifeState).toBe(LifeState.DOWNED);
      expect(player.bleedTimer).toBe(BLEEDOUT_DURATION);
    });

    it("does nothing for already dead player", () => {
      const player = makePlayer({ lifeState: LifeState.DEAD, health: 0 });
      state.players.set("s1", player);

      gameLoop.killPlayer("s1");

      expect(player.lifeState).toBe(LifeState.DEAD);
    });

    it("does nothing for nonexistent session", () => {
      // Should not throw
      gameLoop.killPlayer("nonexistent");
    });

    it("clears effects when player is downed", () => {
      const player = makePlayer({ health: 100 });
      state.players.set("s1", player);

      gameLoop.killPlayer("s1");

      expect(calls.effectClear.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // revivePlayer
  // ────────────────────────────────────────────────────────────────────────
  describe("revivePlayer", () => {
    it("revives a downed player at full health", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED, maxHealth: 100 });
      player.bleedTimer = 20;
      state.players.set("s1", player);

      const result = gameLoop.revivePlayer("s1");

      expect(result).toBe(true);
      expect(player.lifeState).toBe(LifeState.ALIVE);
      expect(player.health).toBe(100);
      expect(player.bleedTimer).toBe(0);
      expect(player.respawnTimer).toBe(0);
      expect(player.reviveProgress).toBe(0);
      expect(player.reviverSessionId).toBe("");
    });

    it("revives a dead player at full health", () => {
      const player = makePlayer({ lifeState: LifeState.DEAD, maxHealth: 80 });
      player.respawnTimer = 10;
      state.players.set("s1", player);

      const result = gameLoop.revivePlayer("s1");

      expect(result).toBe(true);
      expect(player.lifeState).toBe(LifeState.ALIVE);
      expect(player.health).toBe(80);
    });

    it("returns false for alive player", () => {
      const player = makePlayer({ lifeState: LifeState.ALIVE });
      state.players.set("s1", player);

      expect(gameLoop.revivePlayer("s1")).toBe(false);
    });

    it("returns false for nonexistent session", () => {
      expect(gameLoop.revivePlayer("nonexistent")).toBe(false);
    });

    it("clears cooldowns and effects on revive", () => {
      const player = makePlayer({ lifeState: LifeState.DOWNED });
      player.itemCooldowns.set("potion", 5);
      state.players.set("s1", player);

      gameLoop.revivePlayer("s1");

      expect(player.itemCooldowns.size).toBe(0);
      expect(calls.combatClearCooldowns).toContain("s1");
      expect(calls.effectClear.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // startRevive
  // ────────────────────────────────────────────────────────────────────────
  describe("startRevive", () => {
    it("starts revive when conditions are met", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      const result = gameLoop.startRevive("reviver1", "target1");

      expect(result).toBe(true);
      expect(target.reviverSessionId).toBe("reviver1");
      expect(target.reviveProgress).toBe(0);
    });

    it("fails if reviver is not alive", () => {
      const reviver = makePlayer({ x: 5, z: 5, lifeState: LifeState.DEAD });
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(false);
    });

    it("fails if reviver is moving", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = true;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(false);
    });

    it("fails if reviver has animState", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "punch";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(false);
    });

    it("fails if target is not downed", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.ALIVE, x: 5, z: 6 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(false);
    });

    it("fails if out of range", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 100, z: 100 });

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(false);
    });

    it("fails if target already being revived by someone else", () => {
      const reviver1 = makePlayer({ x: 5, z: 5 });
      reviver1.isMoving = false;
      reviver1.animState = "";
      const reviver2 = makePlayer({ x: 5, z: 7 });
      reviver2.isMoving = false;
      reviver2.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.reviverSessionId = "reviver1";

      state.players.set("reviver1", reviver1);
      state.players.set("reviver2", reviver2);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver2", "target1")).toBe(false);
    });

    it("allows same reviver to re-start revive", () => {
      const reviver = makePlayer({ x: 5, z: 5 });
      reviver.isMoving = false;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.reviverSessionId = "reviver1";

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      expect(gameLoop.startRevive("reviver1", "target1")).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // moveEntity
  // ────────────────────────────────────────────────────────────────────────
  describe("moveEntity", () => {
    it("moves player along path toward waypoint", () => {
      const player = makePlayer({ x: 0, z: 0, speed: 10 });
      player.isMoving = true;
      player.path = [{ x: 10, z: 0 }];
      player.currentPathIndex = 0;

      // Move for 0.5s at speed 10 => 5 units
      gameLoop.moveEntity(player, 0.5);

      expect(player.x).toBeCloseTo(5, 1);
      expect(player.z).toBeCloseTo(0, 1);
      expect(player.isMoving).toBe(true);
    });

    it("snaps to waypoint and stops when path exhausted", () => {
      const player = makePlayer({ x: 0, z: 0, speed: 10 });
      player.isMoving = true;
      player.path = [{ x: 3, z: 0 }];
      player.currentPathIndex = 0;

      // Move for 1s at speed 10 => 10 units, waypoint at 3
      gameLoop.moveEntity(player, 1.0);

      expect(player.x).toBeCloseTo(3, 1);
      expect(player.isMoving).toBe(false);
    });

    it("advances through multiple waypoints in one tick", () => {
      const player = makePlayer({ x: 0, z: 0, speed: 20 });
      player.isMoving = true;
      player.path = [
        { x: 2, z: 0 },
        { x: 4, z: 0 },
        { x: 6, z: 0 },
      ];
      player.currentPathIndex = 0;

      // 1s at speed 20 => 20 units, enough to pass all 3 waypoints
      gameLoop.moveEntity(player, 1.0);

      expect(player.x).toBeCloseTo(6, 1);
      expect(player.isMoving).toBe(false);
    });

    it("applies sprint speed multiplier", () => {
      const player = makePlayer({ x: 0, z: 0, speed: 10 });
      player.isMoving = true;
      player.isSprinting = true;
      player.path = [{ x: 100, z: 0 }];
      player.currentPathIndex = 0;

      // 1s at speed 10 * 1.5 = 15 units
      gameLoop.moveEntity(player, 1.0);

      expect(player.x).toBeCloseTo(10 * SPRINT_SPEED_MULTIPLIER, 1);
    });

    it("does nothing when not moving", () => {
      const player = makePlayer({ x: 5, z: 5 });
      player.isMoving = false;

      gameLoop.moveEntity(player, 1.0);

      expect(player.x).toBe(5);
      expect(player.z).toBe(5);
    });

    it("does nothing when path index is beyond path length", () => {
      const player = makePlayer({ x: 5, z: 5 });
      player.isMoving = true;
      player.path = [{ x: 10, z: 10 }];
      player.currentPathIndex = 5;

      gameLoop.moveEntity(player, 1.0);

      expect(player.isMoving).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // handleCombatHit
  // ────────────────────────────────────────────────────────────────────────
  describe("handleCombatHit", () => {
    it("adds threat on hit", () => {
      const player = makePlayer();
      const creature = makeCreature();
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 2,
        finalDamage: 8,
        targetHealth: 42,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      });

      expect(calls.aiAddThreat.length).toBe(1);
      expect(calls.aiAddThreat[0]).toEqual({
        creatureId: "c1",
        sessionId: "s1",
        amount: 8,
      });
    });

    it("sends damage dealt to client", () => {
      const player = makePlayer();
      const creature = makeCreature();
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 2,
        finalDamage: 8,
        targetHealth: 42,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      });

      const dmgSent = calls.sendToClient.find((c: any) => c.type === MessageType.DAMAGE_DEALT);
      expect(dmgSent).toBeTruthy();
      expect(dmgSent.message.dmg).toBe(8);
      expect(dmgSent.message.kill).toBe(false);
    });

    it("processes kill: clears target, unregisters AI, distributes gold", () => {
      const player = makePlayer({ level: 1 });
      const creature = makeCreature({ level: 1 });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 1,
        finalDamage: 9,
        targetHealth: 0,
        targetMaxHealth: 50,
        killed: true,
        skillId: "",
      });

      expect(calls.combatClearTargetFor).toContain("c1");
      expect(calls.aiUnregister).toContain("c1");
      expect(player.gold).toBeGreaterThan(0);
    });

    it("grants XP on kill to alive players", () => {
      const player = makePlayer({ level: 1, xp: 0 });
      const creature = makeCreature({ level: 1 });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 0,
        targetMaxHealth: 50,
        killed: true,
        skillId: "",
      });

      expect(player.xp).toBeGreaterThan(0);
    });

    it("spawns loot bag when creature has loot entries", () => {
      const player = makePlayer({ level: 1 });
      const creature = makeCreature({ x: 10, z: 10 });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureLoot = [{ itemId: "potion", dropChance: 1.0, minQuantity: 1, maxQuantity: 1 }];
      mockItemDefs.set("potion", {
        id: "potion",
        name: "Potion",
        maxStack: 5,
        rarity: "common",
        equipSlot: null,
      });

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 0,
        targetMaxHealth: 50,
        killed: true,
        skillId: "",
      });

      expect(state.lootBags.size).toBe(1);
    });

    it("announces boss engagement on first hit", () => {
      const player = makePlayer();
      const creature = makeCreature({ creatureType: "golem" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureTypeDef = { isBoss: true };

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 40,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      });

      expect(calls.chatBroadcastAnnouncement.length).toBe(1);
      expect(calls.chatBroadcastAnnouncement[0][0]).toBe("quest.bossEngage");
    });

    it("does not re-announce boss on subsequent hits", () => {
      const player = makePlayer();
      const creature = makeCreature({ creatureType: "golem" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureTypeDef = { isBoss: true };

      const hitEvent = {
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 40,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      };

      gameLoop.handleCombatHit(hitEvent);
      gameLoop.handleCombatHit(hitEvent);

      expect(calls.chatBroadcastAnnouncement.length).toBe(1);
    });

    it("sends resetOnKill cooldown clear for qualifying skill", () => {
      const player = makePlayer();
      const creature = makeCreature();
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockSkillDefs.set("execute", {
        id: "execute",
        resetOnKill: true,
        cooldown: 10,
      });

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 0,
        targetMaxHealth: 50,
        killed: true,
        skillId: "execute",
      });

      const cooldownMsg = calls.sendToClient.find(
        (c: any) => c.type === MessageType.SKILL_COOLDOWN && c.message.skillId === "execute",
      );
      expect(cooldownMsg).toBeTruthy();
      expect(cooldownMsg.message.remaining).toBe(0);
    });

    it("notifies quest system on hit and kill", () => {
      const player = makePlayer();
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 10,
        targetDefense: 0,
        finalDamage: 10,
        targetHealth: 0,
        targetMaxHealth: 50,
        killed: true,
        skillId: "",
      });

      expect(calls.questCreatureHit).toContain("zombie");
      expect(calls.questCreatureKilled).toContain("zombie");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // applyCreatureEffect
  // ────────────────────────────────────────────────────────────────────────
  describe("applyCreatureEffect", () => {
    it("creates a new effect on the creature", () => {
      const creature = makeCreature();
      mockEffectDefs.set("weakness", {
        duration: 5,
        statModifiers: { attack: { value: -0.25, type: "percent" } },
      });

      gameLoop.applyCreatureEffect(creature, "weakness");

      expect(creature.effects.size).toBe(1);
      const effect = creature.effects.get("weakness");
      expect(effect).toBeTruthy();
      expect(effect!.duration).toBe(5);
      expect(effect!.remaining).toBe(5);
    });

    it("refreshes timer on re-application", () => {
      const creature = makeCreature();
      mockEffectDefs.set("weakness", {
        duration: 5,
        statModifiers: { attack: { value: -0.25, type: "percent" } },
      });

      gameLoop.applyCreatureEffect(creature, "weakness");
      // Simulate time passing
      creature.effects.get("weakness")!.remaining = 1;
      gameLoop.applyCreatureEffect(creature, "weakness");

      expect(creature.effects.get("weakness")!.remaining).toBe(5);
    });

    it("does nothing for unknown effect", () => {
      const creature = makeCreature();

      gameLoop.applyCreatureEffect(creature, "nonexistent");

      expect(creature.effects.size).toBe(0);
    });

    it("recomputes creature speed after applying effect", () => {
      const creature = makeCreature({ baseSpeed: 3 });
      mockEffectDefs.set("hamstring", {
        duration: 3,
        statModifiers: { moveSpeed: { value: -0.35, type: "percent" } },
      });

      gameLoop.applyCreatureEffect(creature, "hamstring");

      // Speed should be reduced: 3 * (1 + (-0.35)) = 3 * 0.65 = 1.95
      expect(creature.speed).toBeCloseTo(3 * 0.65, 2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // tickCreatureEffects (via update)
  // ────────────────────────────────────────────────────────────────────────
  describe("tickCreatureEffects (via update)", () => {
    it("ticks down creature effect timers", () => {
      const creature = makeCreature();
      mockEffectDefs.set("hamstring", {
        duration: 3,
        statModifiers: { moveSpeed: { value: -0.35, type: "percent" } },
      });

      gameLoop.applyCreatureEffect(creature, "hamstring");
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      expect(creature.effects.get("hamstring")!.remaining).toBeCloseTo(2, 1);
    });

    it("removes expired creature effects and recomputes speed", () => {
      const creature = makeCreature({ baseSpeed: 3 });
      mockEffectDefs.set("hamstring", {
        duration: 3,
        statModifiers: { moveSpeed: { value: -0.35, type: "percent" } },
      });

      gameLoop.applyCreatureEffect(creature, "hamstring");
      creature.effects.get("hamstring")!.remaining = 0.5;
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      expect(creature.effects.size).toBe(0);
      // Speed restored to base
      expect(creature.speed).toBe(3);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Debug paths
  // ────────────────────────────────────────────────────────────────────────
  describe("debug paths", () => {
    it("adds and removes debug clients", () => {
      gameLoop.setDebugPaths("s1", true);
      // Should not throw; debug paths sent on next update
      const player = makePlayer();
      player.path = [{ x: 10, z: 10 }];
      player.currentPathIndex = 0;
      state.players.set("s1", player);

      gameLoop.update(1000);

      const debugMsg = calls.sendToClient.find((c: any) => c.type === MessageType.DEBUG_PATHS);
      expect(debugMsg).toBeTruthy();
    });

    it("does not send debug paths when no clients subscribed", () => {
      const player = makePlayer();
      player.path = [{ x: 10, z: 10 }];
      player.currentPathIndex = 0;
      state.players.set("s1", player);

      gameLoop.update(1000);

      const debugMsg = calls.sendToClient.find((c: any) => c.type === MessageType.DEBUG_PATHS);
      expect(debugMsg).toBeUndefined();
    });

    it("removeDebugClient stops sending", () => {
      gameLoop.setDebugPaths("s1", true);
      gameLoop.removeDebugClient("s1");

      const player = makePlayer();
      player.path = [{ x: 10, z: 10 }];
      player.currentPathIndex = 0;
      state.players.set("s1", player);

      gameLoop.update(1000);

      const debugMsg = calls.sendToClient.find((c: any) => c.type === MessageType.DEBUG_PATHS);
      expect(debugMsg).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // resolveEntityCollisions (via update)
  // ────────────────────────────────────────────────────────────────────────
  describe("resolveEntityCollisions (via update)", () => {
    it("pushes overlapping players apart", () => {
      const p1 = makePlayer({ x: 5, z: 5 });
      const p2 = makePlayer({ x: 5, z: 5 }); // exact same position

      state.players.set("s1", p1);
      state.players.set("s2", p2);

      gameLoop.update(100);

      // They should no longer be at the exact same position
      const dx = p1.x - p2.x;
      const dz = p1.z - p2.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeGreaterThan(0);
    });

    it("does not push dead entities", () => {
      const p1 = makePlayer({ x: 5, z: 5, lifeState: LifeState.DEAD });
      p1.respawnTimer = 999; // prevent respawn during this tick
      const p2 = makePlayer({ x: 5, z: 5 });

      state.players.set("s1", p1);
      state.players.set("s2", p2);

      gameLoop.update(100);

      // Dead player should remain at original position (not included in collision)
      // The alive player might shift slightly from wall margin, but the dead one won't move from collision
      expect(p1.x).toBe(5);
      expect(p1.z).toBe(5);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // update orchestration
  // ────────────────────────────────────────────────────────────────────────
  describe("update orchestration", () => {
    it("calls aiSystem.update and combatSystem.update", () => {
      const player = makePlayer();
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(calls.aiUpdate.length).toBe(1);
      expect(calls.combatUpdate.length).toBe(1);
    });

    it("calls effectSystem.update", () => {
      const player = makePlayer();
      state.players.set("s1", player);

      gameLoop.update(1000);

      expect(calls.effectUpdate.length).toBe(1);
    });

    it("calls questSystem.tick", () => {
      gameLoop.update(1000);

      expect(calls.questTick.length).toBe(1);
    });

    it("skips movement for non-alive players", () => {
      const player = makePlayer({
        lifeState: LifeState.DOWNED,
        x: 5,
        z: 5,
      });
      player.isMoving = true;
      player.path = [{ x: 10, z: 10 }];
      player.bleedTimer = BLEEDOUT_DURATION;
      state.players.set("s1", player);

      gameLoop.update(1000);

      // Position should not change (movement skipped)
      // isMoving should be forced to false
      expect(player.isMoving).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // resetDungeonState
  // ────────────────────────────────────────────────────────────────────────
  describe("resetDungeonState", () => {
    it("resets boss engagement flag so announcement fires again", () => {
      const player = makePlayer();
      const creature = makeCreature({ creatureType: "golem" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureTypeDef = { isBoss: true };

      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 5,
        targetDefense: 0,
        finalDamage: 5,
        targetHealth: 45,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      });

      expect(calls.chatBroadcastAnnouncement.length).toBe(1);

      gameLoop.resetDungeonState();

      // Re-add creature (previous one was not killed)
      gameLoop.handleCombatHit({
        sessionId: "s1",
        creatureId: "c1",
        attackDamage: 5,
        targetDefense: 0,
        finalDamage: 5,
        targetHealth: 40,
        targetMaxHealth: 50,
        killed: false,
        skillId: "",
      });

      expect(calls.chatBroadcastAnnouncement.length).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // handlePlayerDamage (via AI onPlayerDamage callback)
  // ────────────────────────────────────────────────────────────────────────
  describe("handlePlayerDamage (via update)", () => {
    it("reduces player health when AI calls onPlayerDamage", () => {
      const player = makePlayer({ health: 100, maxHealth: 100 });
      state.players.set("s1", player);

      // Override aiSystem.update to invoke the onPlayerDamage callback
      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        onDamage: (sessionId: string, damage: number) => void,
        _onHit: any,
      ) => {
        onDamage("s1", 30);
      };

      gameLoop.update(1000);

      expect(player.health).toBe(70);
      expect(player.lifeState).toBe(LifeState.ALIVE);
    });

    it("transitions player to DOWNED when health reaches 0", () => {
      const player = makePlayer({ health: 20, maxHealth: 100 });
      state.players.set("s1", player);

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        onDamage: (sessionId: string, damage: number) => void,
        _onHit: any,
      ) => {
        onDamage("s1", 25);
      };

      gameLoop.update(1000);

      expect(player.health).toBe(0);
      expect(player.lifeState).toBe(LifeState.DOWNED);
      expect(player.bleedTimer).toBe(BLEEDOUT_DURATION);
    });

    it("ignores damage when player has godMode", () => {
      const player = makePlayer({ health: 100, maxHealth: 100 });
      player.godMode = true;
      state.players.set("s1", player);

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        onDamage: (sessionId: string, damage: number) => void,
        _onHit: any,
      ) => {
        onDamage("s1", 50);
      };

      gameLoop.update(1000);

      expect(player.health).toBe(100);
      expect(player.lifeState).toBe(LifeState.ALIVE);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // handleCreatureHit (via AI onHit callback)
  // ────────────────────────────────────────────────────────────────────────
  describe("handleCreatureHit (via update)", () => {
    it("broadcasts combat log to admins", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      const combatLog = calls.broadcastToAdmins.find((c: any) => c.type === MessageType.COMBAT_LOG);
      expect(combatLog).toBeTruthy();
      expect(combatLog.message.dir).toBe("e2p");
      expect(combatLog.message.dmg).toBe(8);
    });

    it("auto-targets creature when player has no current target", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      let setTargetCalled = false;
      (bridge.combatSystem as any).getTarget = () => null;
      (bridge.combatSystem as any).setTarget = (sid: string, cid: string) => {
        setTargetCalled = true;
        expect(sid).toBe("s1");
        expect(cid).toBe("c1");
      };

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      expect(setTargetCalled).toBe(true);
      const autoTargetMsg = calls.sendToClient.find((c: any) => c.type === MessageType.AUTO_TARGET);
      expect(autoTargetMsg).toBeTruthy();
      expect(autoTargetMsg.message.creatureId).toBe("c1");
    });

    it("skips auto-target when player already has a target", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      (bridge.combatSystem as any).getTarget = () => "c2"; // already has a target
      let setTargetCalled = false;
      (bridge.combatSystem as any).setTarget = () => {
        setTargetCalled = true;
      };

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      expect(setTargetCalled).toBe(false);
      const autoTargetMsg = calls.sendToClient.find((c: any) => c.type === MessageType.AUTO_TARGET);
      expect(autoTargetMsg).toBeUndefined();
    });

    it("cancels revive channel when reviver takes damage", () => {
      const reviver = makePlayer({ x: 5, z: 5, health: 80, maxHealth: 100 });
      reviver.isMoving = false;
      reviver.animState = "";
      const target = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      target.bleedTimer = BLEEDOUT_DURATION;
      target.reviverSessionId = "reviver1";
      target.reviveProgress = 0.5;

      state.players.set("reviver1", reviver);
      state.players.set("target1", target);

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "reviver1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      // Need creature in state for the hit to process fully
      const creature = makeCreature({ creatureType: "zombie" });
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      expect(target.reviverSessionId).toBe("");
      expect(target.reviveProgress).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // applyCreatureEffects (via handleCreatureHit → update)
  // ────────────────────────────────────────────────────────────────────────
  describe("applyCreatureEffects (via handleCreatureHit)", () => {
    it("applies ON_HIT effect when chance is 1.0", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureEffects = [
        {
          effectId: "weakness",
          trigger: "on_hit",
          chance: 1.0,
          maxChance: null,
          stacks: 1,
          minLevel: 0,
          maxLevel: 0,
          scalingOverride: null,
        },
      ];
      mockEffectDefs.set("weakness", {
        duration: 5,
        isDebuff: true,
        statModifiers: { attack: { value: -0.25, type: "percent" } },
      });

      // Ensure Math.random returns a value below the chance
      const origRandom = Math.random;
      Math.random = () => 0.5;

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      Math.random = origRandom;

      expect(calls.effectApply.length).toBeGreaterThanOrEqual(1);
      const applyCall = calls.effectApply.find((c: any) => c[1] === "weakness");
      expect(applyCall).toBeTruthy();
    });

    it("ON_HIT_BEHIND only fires on back-hit", () => {
      // Player facing away from creature (creature behind player)
      const player = makePlayer({ health: 80, maxHealth: 100, x: 5, z: 5, rotY: 0 });
      // Creature behind the player (opposite direction of facing)
      const creature = makeCreature({ creatureType: "zombie", x: 5, z: 8 });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureEffects = [
        {
          effectId: "hamstring",
          trigger: "on_hit_behind",
          chance: 1.0,
          maxChance: null,
          stacks: 1,
          minLevel: 0,
          maxLevel: 0,
          scalingOverride: null,
        },
      ];
      mockEffectDefs.set("hamstring", {
        duration: 3,
        isDebuff: true,
        statModifiers: { moveSpeed: { value: -0.35, type: "percent" } },
      });

      const origRandom = Math.random;
      Math.random = () => 0.5;

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      Math.random = origRandom;

      // Whether the effect was applied depends on back-hit check.
      // With rotY=0 (facing +Z) and creature at z=8 (also in +Z), it's NOT behind.
      // So the effect should NOT be applied.
      const applyCall = calls.effectApply.find((c: any) => c[1] === "hamstring");
      expect(applyCall).toBeUndefined();
    });

    it("level gating skips effects outside dungeon level range", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);
      state.dungeonLevel = 1; // below minLevel

      mockCreatureEffects = [
        {
          effectId: "weakness",
          trigger: "on_hit",
          chance: 1.0,
          maxChance: null,
          stacks: 1,
          minLevel: 5, // requires dungeon level >= 5
          maxLevel: 0,
          scalingOverride: null,
        },
      ];
      mockEffectDefs.set("weakness", {
        duration: 5,
        isDebuff: true,
        statModifiers: { attack: { value: -0.25, type: "percent" } },
      });

      const origRandom = Math.random;
      Math.random = () => 0.5;

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      Math.random = origRandom;

      const applyCall = calls.effectApply.find((c: any) => c[1] === "weakness");
      expect(applyCall).toBeUndefined();
    });

    it("respects chance roll (Math.random > chance → no effect)", () => {
      const player = makePlayer({ health: 80, maxHealth: 100 });
      const creature = makeCreature({ creatureType: "zombie" });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      mockCreatureEffects = [
        {
          effectId: "weakness",
          trigger: "on_hit",
          chance: 0.1, // 10% chance
          maxChance: null,
          stacks: 1,
          minLevel: 0,
          maxLevel: 0,
          scalingOverride: null,
        },
      ];
      mockEffectDefs.set("weakness", {
        duration: 5,
        isDebuff: true,
        statModifiers: { attack: { value: -0.25, type: "percent" } },
      });

      const origRandom = Math.random;
      Math.random = () => 0.99; // above 0.1 chance

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "s1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      Math.random = origRandom;

      const applyCall = calls.effectApply.find((c: any) => c[1] === "weakness");
      expect(applyCall).toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // handleAdminCreatureKill
  // ────────────────────────────────────────────────────────────────────────
  describe("handleAdminCreatureKill", () => {
    it("processes creature kill with first alive player as killer", () => {
      const player = makePlayer({ level: 1 });
      const creature = makeCreature({ level: 1 });
      state.players.set("s1", player);
      state.creatures.set("c1", creature);

      gameLoop.handleAdminCreatureKill("c1");

      // processCreatureKill unregisters from AI and distributes gold
      expect(calls.aiUnregister).toContain("c1");
      expect(player.gold).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // sendDebugPaths with both players and creatures
  // ────────────────────────────────────────────────────────────────────────
  describe("sendDebugPaths with creatures", () => {
    it("sends both player and creature paths to debug client", () => {
      gameLoop.setDebugPaths("s1", true);

      const player = makePlayer();
      player.path = [{ x: 10, z: 10 }];
      player.currentPathIndex = 0;
      state.players.set("s1", player);

      const creature = makeCreature();
      creature.path = [{ x: 20, z: 20 }];
      creature.currentPathIndex = 0;
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      const debugMsg = calls.sendToClient.find((c: any) => c.type === MessageType.DEBUG_PATHS);
      expect(debugMsg).toBeTruthy();
      expect(debugMsg.message.paths.length).toBe(2);

      const playerPath = debugMsg.message.paths.find((p: any) => p.kind === "player");
      const creaturePath = debugMsg.message.paths.find((p: any) => p.kind === "creature");
      expect(playerPath).toBeTruthy();
      expect(creaturePath).toBeTruthy();
      expect(creaturePath.id).toBe("c1");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // cancelReviveByReviver
  // ────────────────────────────────────────────────────────────────────────
  describe("cancelReviveByReviver (via handleCreatureHit)", () => {
    it("resets reviveProgress and reviverSessionId on the target being revived", () => {
      const reviver = makePlayer({ x: 5, z: 5, health: 80, maxHealth: 100 });
      reviver.isMoving = false;
      reviver.animState = "";
      const targetA = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 6 });
      targetA.bleedTimer = BLEEDOUT_DURATION;
      targetA.reviverSessionId = "reviver1";
      targetA.reviveProgress = 0.7;

      const targetB = makePlayer({ lifeState: LifeState.DOWNED, x: 5, z: 7 });
      targetB.bleedTimer = BLEEDOUT_DURATION;
      targetB.reviverSessionId = "other_reviver";
      targetB.reviveProgress = 0.3;

      // Must add the other reviver to the players map so updateLifeStates doesn't cancel it
      const otherReviver = makePlayer({ x: 5, z: 7 });
      otherReviver.isMoving = false;
      otherReviver.animState = "";

      state.players.set("reviver1", reviver);
      state.players.set("targetA", targetA);
      state.players.set("targetB", targetB);
      state.players.set("other_reviver", otherReviver);

      const creature = makeCreature({ creatureType: "zombie" });
      state.creatures.set("c1", creature);

      (bridge.aiSystem as any).update = (
        _dt: number,
        _players: any,
        _onDamage: any,
        onHit: (event: any) => void,
      ) => {
        onHit({
          creatureId: "c1",
          sessionId: "reviver1",
          attackDamage: 10,
          targetDefense: 2,
          finalDamage: 8,
        });
      };

      gameLoop.update(1000);

      // targetA's revive should be cancelled (reviver1 was hit)
      expect(targetA.reviverSessionId).toBe("");
      expect(targetA.reviveProgress).toBe(0);

      // targetB's revive should NOT be affected (different reviver)
      expect(targetB.reviverSessionId).toBe("other_reviver");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // onNotFacing callback (lines 269-271)
  // ────────────────────────────────────────────────────────────────────────
  describe("onNotFacing callback", () => {
    it("sends ACTION_FEEDBACK with feedback.notFacing when combat system fires callback", () => {
      const player = makePlayer();
      state.players.set("s1", player);

      // Override combatSystem.update to invoke the onNotFacing callback
      (bridge.combatSystem as any).update = (
        _dt: number,
        _players: any,
        _creatures: any,
        _onHit: any,
        onNotFacing: (sessionId: string) => void,
      ) => {
        onNotFacing("s1");
      };

      gameLoop.update(1000);

      const feedbackMsg = calls.sendToClient.find(
        (c: any) =>
          c.type === MessageType.ACTION_FEEDBACK && c.message.i18nKey === "feedback.notFacing",
      );
      expect(feedbackMsg).toBeTruthy();
      expect(feedbackMsg.sessionId).toBe("s1");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // enforceWallMargin for creatures (lines 283-284)
  // ────────────────────────────────────────────────────────────────────────
  describe("enforceWallMargin for creatures (via update)", () => {
    it("runs enforceWallMargin on alive creatures during update", () => {
      const creature = makeCreature({ x: 10, z: 10 });
      state.creatures.set("c1", creature);

      // Just verify update() runs without error when creatures are present
      // enforceWallMargin uses pathfinder.isWalkable which returns true in mock
      gameLoop.update(1000);

      // Creature should still exist and be in a valid state
      expect(creature.x).toBeDefined();
      expect(creature.z).toBeDefined();
    });

    it("skips enforceWallMargin on dead creatures", () => {
      const creature = makeCreature({ x: 10, z: 10, isDead: true });
      state.creatures.set("c1", creature);

      const origX = creature.x;
      const origZ = creature.z;

      gameLoop.update(1000);

      // Dead creature position should not be modified by enforceWallMargin
      expect(creature.x).toBe(origX);
      expect(creature.z).toBe(origZ);
    });

    it("enforceWallMargin pushes creature away from non-walkable +X neighbour", () => {
      // TILE_SIZE = 2, WALL_MARGIN = 0.35
      // Place creature at tile (5,5) center = world (10, 10)
      // Push it close to the +X edge: cx + half - margin = 10 + 1 - 0.35 = 10.65
      // Set x beyond that threshold to trigger the push
      const creature = makeCreature({ x: 10.8, z: 10 });
      state.creatures.set("c1", creature);

      // Make isWalkable return false for tile (6, 5) — the +X neighbour of tile (5,5)
      // creature at world 10.8 → tile = Math.round(10.8 / 2) = Math.round(5.4) = 5
      // So +X neighbour = tile (6, 5)
      bridge.pathfinder.isWalkable = (tx: number, tz: number) => {
        if (tx === 6 && tz === 5) return false;
        return true;
      };

      gameLoop.update(1000);

      // Creature should be pushed back to edge - WALL_MARGIN = 10 + 1 - 0.35 = 10.65
      expect(creature.x).toBeCloseTo(10.65, 2);
      expect(creature.z).toBe(10); // Z unchanged
    });

    it("enforceWallMargin pushes creature away from non-walkable -Z neighbour", () => {
      // creature at tile (5,5), push close to -Z edge
      // cz - half + margin = 10 - 1 + 0.35 = 9.35
      const creature = makeCreature({ x: 10, z: 9.2 });
      state.creatures.set("c1", creature);

      // -Z neighbour = tile (5, 4)
      bridge.pathfinder.isWalkable = (tx: number, tz: number) => {
        if (tx === 5 && tz === 4) return false;
        return true;
      };

      gameLoop.update(1000);

      expect(creature.z).toBeCloseTo(9.35, 2);
      expect(creature.x).toBe(10); // X unchanged
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // resolveEntityCollisions — creature setPos
  // ────────────────────────────────────────────────────────────────────────
  describe("resolveEntityCollisions — creature position adjustment", () => {
    it("pushes overlapping player and creature apart, calling creature setPos", () => {
      // Place player and creature at the exact same position
      // ENTITY_COLLISION_RADIUS = 0.45, DIAMETER = 0.9
      const player = makePlayer({ x: 10, z: 10 });
      state.players.set("s1", player);

      const creature = makeCreature({ x: 10, z: 10 });
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      // They were at the same spot → overlap detected → pushed apart
      // After collision resolution, they should no longer be at the same position
      const dx = creature.x - player.x;
      const dz = creature.z - player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // They should be pushed to at least DIAMETER apart (or close to it)
      expect(dist).toBeGreaterThan(0);
      // At least one of them must have moved
      expect(player.x !== 10 || player.z !== 10 || creature.x !== 10 || creature.z !== 10).toBe(
        true,
      );
    });

    it("does not push dead creatures during collision resolution", () => {
      const player = makePlayer({ x: 10, z: 10 });
      state.players.set("s1", player);

      const creature = makeCreature({ x: 10, z: 10, isDead: true });
      state.creatures.set("c1", creature);

      gameLoop.update(1000);

      // Dead creature is excluded from collision entities array, so no push
      expect(creature.x).toBe(10);
      expect(creature.z).toBe(10);
    });
  });
});
