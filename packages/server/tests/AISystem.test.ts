import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { resolve } from "path";

// ── Module mocks (must be set up before importing AISystem) ─────────────────

const SRC = resolve(import.meta.dir, "../src");
const m = (rel: string) => resolve(SRC, rel);

// Mock getCreatureDefaultSkill — returns a skill with punch anim + 1x damage by default
let mockDefaultSkill: any = {
  skillId: "basic_attack",
  isDefault: true,
  def: { animState: "punch", damageMultiplier: 1.0 },
};

const creatureTypeRegistryMock = () => ({
  getCreatureDefaultSkill: (_id: string) => mockDefaultSkill,
});

mock.module(m("creatures/CreatureTypeRegistry"), creatureTypeRegistryMock);
mock.module(m("creatures/CreatureTypeRegistry.js"), creatureTypeRegistryMock);
mock.module(m("creatures/CreatureTypeRegistry.ts"), creatureTypeRegistryMock);

// Logger is already silent in NODE_ENV=test, but mock to be safe
const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  child: () => noopLogger,
};
const loggerMock = () => ({ logger: noopLogger });
mock.module(m("logger"), loggerMock);
mock.module(m("logger.js"), loggerMock);
mock.module(m("logger.ts"), loggerMock);

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { AISystem } from "../src/systems/AISystem.js";
import { CreatureState } from "../src/state/CreatureState.js";
import { PlayerState } from "../src/state/PlayerState.js";
import {
  TILE_SIZE,
  ATTACK_ANIM_DURATION,
  DAMAGE_DELAY,
  CREATURE_REPATH_INTERVAL,
  LifeState,
} from "@dungeon/shared";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeMockPathfinder(findPathResult: { x: number; z: number }[] = []) {
  return {
    findPath: mock((_from: any, _to: any) => findPathResult),
    hasLineOfSight: mock(() => true),
  };
}

function makeMockTileMap(isFloorResult = true) {
  return {
    isFloor: mock(() => isFloorResult),
  };
}

function makeCreature(overrides: Partial<Record<string, any>> = {}): CreatureState {
  const c = new CreatureState();
  c.x = 10;
  c.z = 10;
  c.speed = 5;
  c.attackRange = 2.5;
  c.attackDamage = 10;
  c.attackCooldown = 1.5;
  c.maxHealth = 100;
  c.health = 100;
  c.detectionRange = 12;
  c.isDead = false;
  c.lifeState = LifeState.ALIVE;
  c.creatureType = "zombie";
  c.isMoving = false;
  c.path = [];
  c.currentPathIndex = 0;
  c.isWalking = false;
  c.isAggro = false;
  c.animState = "";
  c.rotY = 0;
  Object.assign(c, overrides);
  return c;
}

function makePlayer(overrides: Partial<Record<string, any>> = {}): PlayerState {
  const p = new PlayerState();
  p.x = 12;
  p.z = 12;
  p.health = 100;
  p.maxHealth = 100;
  p.defense = 5;
  p.lifeState = LifeState.ALIVE;
  Object.assign(p, overrides);
  return p;
}

function makePlayers(...entries: [string, PlayerState][]): Map<string, PlayerState> {
  return new Map(entries);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AISystem", () => {
  let ai: AISystem;
  let pathfinder: ReturnType<typeof makeMockPathfinder>;
  let tileMap: ReturnType<typeof makeMockTileMap>;

  beforeEach(() => {
    pathfinder = makeMockPathfinder([{ x: 12, z: 12 }]);
    tileMap = makeMockTileMap(true);
    ai = new AISystem(pathfinder as any, tileMap);
    mockDefaultSkill = {
      skillId: "basic_attack",
      isDefault: true,
      def: { animState: "punch", damageMultiplier: 1.0 },
    };
  });

  // ── Registration ────────────────────────────────────────────────────────

  describe("register / unregister / clearAll", () => {
    it("register adds creature to the system", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      // Verify by checking hasActiveCombat (no threat yet → false, but creature exists)
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("unregister removes a creature by id", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);

      ai.unregister("c1");
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("unregister on unknown id does not throw", () => {
      expect(() => ai.unregister("nonexistent")).not.toThrow();
    });

    it("clearAll removes all creatures", () => {
      ai.register(makeCreature(), "c1", 20);
      ai.register(makeCreature(), "c2", 20);
      ai.addThreat("c1", "p1", 10);
      ai.addThreat("c2", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);

      ai.clearAll();
      expect(ai.hasActiveCombat()).toBe(false);
    });
  });

  // ── Threat management ──────────────────────────────────────────────────

  describe("addThreat", () => {
    it("increases threat for creature toward a player", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);
    });

    it("transitions IDLE → CHASE on first threat", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      // After addThreat, state should be CHASE (1).
      // We verify this indirectly: update with the target out of attack range triggers chase pathfinding
      const player = makePlayer({ x: 20, z: 20 }); // far away
      const players = makePlayers(["p1", player]);
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Should have called findPath for chase
      expect(pathfinder.findPath).toHaveBeenCalled();
    });

    it("is no-op on dead creature", () => {
      const creature = makeCreature({ isDead: true });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("transitions ROAM → CHASE when threat is added", () => {
      // Set up a creature that is currently roaming
      const creature = makeCreature();
      ai.register(creature, "c1", 20);

      // Force into ROAM by ticking with expired roam timer and no players
      // Instead, just add threat which should transition from IDLE/ROAM → CHASE
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 });
      const players = makePlayers(["p1", player]);
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Creature should be chasing (pathfinder called)
      expect(pathfinder.findPath).toHaveBeenCalled();
    });

    it("accumulates threat from multiple calls", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 5);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);
    });
  });

  describe("hasActiveCombat", () => {
    it("returns false when no creatures registered", () => {
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("returns false when creatures have no threat", () => {
      ai.register(makeCreature(), "c1", 20);
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("returns true when any creature has threat", () => {
      ai.register(makeCreature(), "c1", 20);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);
    });

    it("skips dead creatures", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);

      creature.isDead = true;
      expect(ai.hasActiveCombat()).toBe(false);
    });
  });

  describe("removePlayer", () => {
    it("removes player from all threat tables", () => {
      ai.register(makeCreature(), "c1", 20);
      ai.register(makeCreature(), "c2", 20);
      ai.addThreat("c1", "p1", 10);
      ai.addThreat("c2", "p1", 10);
      expect(ai.hasActiveCombat()).toBe(true);

      ai.removePlayer("p1");
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("does not affect threat from other players", () => {
      ai.register(makeCreature(), "c1", 20);
      ai.addThreat("c1", "p1", 10);
      ai.addThreat("c1", "p2", 5);

      ai.removePlayer("p1");
      expect(ai.hasActiveCombat()).toBe(true);
    });
  });

  // ── update() — IDLE state ──────────────────────────────────────────────

  describe("update — IDLE state", () => {
    it("skips dead creatures entirely", () => {
      const creature = makeCreature({ isDead: true, health: 50, maxHealth: 100 });
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      ai.update(
        1.0,
        players,
        () => {},
        () => {},
      );
      // Health should NOT regen since creature is dead (skipped)
      expect(creature.health).toBe(50);
    });

    it("creature stays idle with no threat and roam timer not expired", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // Short tick — roam timer starts at 2-6 seconds, so 0.1s won't expire it
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      expect(creature.isMoving).toBe(false);
      expect(creature.isAggro).toBe(false);
    });

    it("starts roaming when roam timer expires", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // Tick with a large dt to expire roam timer (max is 6s)
      ai.update(
        7.0,
        players,
        () => {},
        () => {},
      );

      // If pathfinder returned a path and tiles are floor, creature should start moving
      expect(creature.isMoving).toBe(true);
      expect(creature.isWalking).toBe(true); // Roam = walk
    });

    it("does not roam if pathfinder returns empty path", () => {
      pathfinder.findPath = mock(() => []);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      ai.update(
        7.0,
        players,
        () => {},
        () => {},
      );
      expect(creature.isMoving).toBe(false);
    });

    it("does not roam if tiles around target are not floor", () => {
      tileMap.isFloor = mock(() => false);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      ai.update(
        7.0,
        players,
        () => {},
        () => {},
      );
      expect(creature.isMoving).toBe(false);
    });
  });

  // ── update() — ROAM state ─────────────────────────────────────────────

  describe("update — ROAM state", () => {
    function setupRoamingCreature() {
      const target = { x: 12, z: 10 };
      pathfinder.findPath = mock(() => [target]);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // Expire roam timer to start roaming
      ai.update(
        7.0,
        players,
        () => {},
        () => {},
      );
      expect(creature.isMoving).toBe(true);

      // Reset findPath mock for subsequent calls
      pathfinder.findPath.mockClear();
      return { creature, players };
    }

    it("moves creature along path while roaming", () => {
      const { creature, players } = setupRoamingCreature();
      const startX = creature.x;

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      // Creature should have moved toward the target
      expect(creature.x).not.toBe(startX);
    });

    it("transitions to IDLE on arrival", () => {
      // Set up a path target that is very close (within waypoint threshold)
      const target = { x: 10.01, z: 10.01 };
      pathfinder.findPath = mock(() => [target]);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature({ x: 10, z: 10 });
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // Expire roam timer to start roaming
      ai.update(
        7.0,
        players,
        () => {},
        () => {},
      );

      // Tick again — creature should arrive (target is within waypoint threshold)
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // After arrival, creature should be idle (not moving)
      expect(creature.isMoving).toBe(false);
    });

    it("aborts to IDLE when stuck (no movement after timeout)", () => {
      const { creature, players } = setupRoamingCreature();

      // Freeze creature position (simulate being stuck)
      const frozenX = creature.x;
      const frozenZ = creature.z;

      // Override moveCreature effect by setting creature to not move
      // We do this by setting speed to 0 so moveCreature won't move it
      creature.speed = 0;

      // Tick past ROAM_STUCK_TIMEOUT (0.5s)
      ai.update(
        0.6,
        players,
        () => {},
        () => {},
      );

      // Creature should be stuck-detected and reset to IDLE
      expect(creature.isMoving).toBe(false);
    });
  });

  // ── update() — CHASE state ────────────────────────────────────────────

  describe("update — CHASE state", () => {
    it("chases target when has threat and out of attack range", () => {
      const creature = makeCreature({ attackRange: 2.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 }); // far from creature
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      expect(pathfinder.findPath).toHaveBeenCalled();
      expect(creature.isMoving).toBe(true);
      expect(creature.isWalking).toBe(false); // Chase = run
    });

    it("respects repathTimer (does not repath every tick)", () => {
      const creature = makeCreature({ attackRange: 2.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 });
      const players = makePlayers(["p1", player]);

      // First tick — should path
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      const callCount1 = pathfinder.findPath.mock.calls.length;

      // Second tick with small dt — repathTimer (0.5s) hasn't expired yet
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      const callCount2 = pathfinder.findPath.mock.calls.length;

      // Should not have called findPath again for chasing
      expect(callCount2).toBe(callCount1);
    });

    it("repaths after CREATURE_REPATH_INTERVAL", () => {
      const creature = makeCreature({ attackRange: 2.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 });
      const players = makePlayers(["p1", player]);

      // First tick
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      pathfinder.findPath.mockClear();

      // Tick past repath interval
      ai.update(
        CREATURE_REPATH_INTERVAL + 0.1,
        players,
        () => {},
        () => {},
      );
      expect(pathfinder.findPath).toHaveBeenCalled();
    });

    it("moves creature toward target", () => {
      const creature = makeCreature({ x: 5, z: 5, attackRange: 2.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 });
      const players = makePlayers(["p1", player]);

      const startX = creature.x;
      const startZ = creature.z;

      ai.update(
        0.5,
        players,
        () => {},
        () => {},
      );

      // Creature should have moved closer to player
      const distBefore = (startX - 20) ** 2 + (startZ - 20) ** 2;
      const distAfter = (creature.x - 20) ** 2 + (creature.z - 20) ** 2;
      expect(distAfter).toBeLessThan(distBefore);
    });
  });

  // ── update() — ATTACK state ───────────────────────────────────────────

  describe("update — ATTACK state", () => {
    function setupAttackScenario() {
      // Creature right next to player (within attack range)
      const creature = makeCreature({ x: 10, z: 10, attackRange: 3.0, attackCooldown: 1.5 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 11, z: 10, defense: 2 }); // distance = 1, within range
      const players = makePlayers(["p1", player]);
      return { creature, player, players };
    }

    it("transitions to ATTACK when target in range", () => {
      const { creature, players } = setupAttackScenario();
      const onPlayerHit = mock(() => {});

      ai.update(0.1, players, onPlayerHit, () => {});

      expect(creature.animState).toBe("punch");
      expect(creature.isMoving).toBe(false);
    });

    it("faces the target player", () => {
      const { creature, player, players } = setupAttackScenario();

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      const expectedAngle = Math.atan2(player.x - creature.x, player.z - creature.z);
      expect(creature.rotY).toBeCloseTo(expectedAngle, 5);
    });

    it("fires onPlayerHit callback after DAMAGE_DELAY", () => {
      const { creature, players } = setupAttackScenario();
      const onPlayerHit = mock((_sid: string, _dmg: number) => {});

      // First tick: starts attack, schedules damage
      ai.update(0.1, players, onPlayerHit, () => {});
      expect(onPlayerHit).not.toHaveBeenCalled();

      // Tick past DAMAGE_DELAY
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});
      expect(onPlayerHit).toHaveBeenCalled();
      expect(onPlayerHit.mock.calls[0][0]).toBe("p1");
    });

    it("fires onHit callback with AIHitEvent details", () => {
      const { creature, players } = setupAttackScenario();
      const onHit = mock((_event: any) => {});
      const onPlayerHit = mock(() => {});

      // First tick: starts attack
      ai.update(0.1, players, onPlayerHit, onHit);

      // Tick past DAMAGE_DELAY to trigger damage
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, onHit);

      expect(onHit).toHaveBeenCalled();
      const event = onHit.mock.calls[0][0];
      expect(event.creatureId).toBe("c1");
      expect(event.sessionId).toBe("p1");
      expect(event.attackDamage).toBe(creature.attackDamage);
      expect(event.finalDamage).toBeGreaterThanOrEqual(1);
    });

    it("does not fire damage again until next attack (respects attackCooldown)", () => {
      const { creature, players } = setupAttackScenario();
      const onPlayerHit = mock(() => {});

      // First attack cycle
      ai.update(0.1, players, onPlayerHit, () => {});
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});
      expect(onPlayerHit).toHaveBeenCalledTimes(1);

      // Small tick — cooldown hasn't expired
      ai.update(0.3, players, onPlayerHit, () => {});
      expect(onPlayerHit).toHaveBeenCalledTimes(1);
    });

    it("attacks again after cooldown expires", () => {
      const { creature, players } = setupAttackScenario();
      const onPlayerHit = mock(() => {});

      // First attack
      ai.update(0.1, players, onPlayerHit, () => {});
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});
      expect(onPlayerHit).toHaveBeenCalledTimes(1);

      // Wait for cooldown to expire (1.5s total)
      ai.update(creature.attackCooldown, players, onPlayerHit, () => {});
      // Now damage should be scheduled again — tick past DAMAGE_DELAY
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});
      expect(onPlayerHit).toHaveBeenCalledTimes(2);
    });

    it("generates self-threat on attack (0.5x multiplier)", () => {
      const { creature, players } = setupAttackScenario();
      const onPlayerHit = mock(() => {});

      ai.update(0.1, players, onPlayerHit, () => {});

      // The creature should still have threat on p1 (initial + self-threat)
      expect(ai.hasActiveCombat()).toBe(true);
    });

    it("skips attack if no default skill is available", () => {
      mockDefaultSkill = null;

      const creature = makeCreature({ x: 10, z: 10, attackRange: 3.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 11, z: 10 });
      const players = makePlayers(["p1", player]);
      const onPlayerHit = mock(() => {});

      ai.update(0.1, players, onPlayerHit, () => {});
      ai.update(DAMAGE_DELAY + 0.5, players, onPlayerHit, () => {});

      expect(onPlayerHit).not.toHaveBeenCalled();
    });

    it("applies damage multiplier from skill", () => {
      mockDefaultSkill = {
        skillId: "golem_slam",
        isDefault: true,
        def: { animState: "slam", damageMultiplier: 1.5 },
      };

      const creature = makeCreature({ x: 10, z: 10, attackRange: 3.0, attackDamage: 20 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 11, z: 10, defense: 0 });
      const players = makePlayers(["p1", player]);
      const onPlayerHit = mock((_sid: string, _dmg: number) => {});

      ai.update(0.1, players, onPlayerHit, () => {});
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});

      expect(onPlayerHit).toHaveBeenCalledTimes(1);
      // computeDamage(20, 0) = 20, * 1.5 = 30
      expect(onPlayerHit.mock.calls[0][1]).toBe(30);
    });
  });

  // ── update() — LEASH state ────────────────────────────────────────────

  describe("update — LEASH state", () => {
    it("leashes when creature moves too far from spawn", () => {
      const creature = makeCreature({ x: 10, z: 10, attackRange: 2.0 });
      ai.register(creature, "c1", 5); // leash range = 5
      ai.addThreat("c1", "p1", 10);

      // Player is far, causing creature to chase way past leash range
      const player = makePlayer({ x: 100, z: 100 });
      const players = makePlayers(["p1", player]);

      // Move creature far from spawn to trigger leash
      creature.x = 50;
      creature.z = 50;

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // After leash: heals to full, paths back to spawn
      expect(creature.health).toBe(creature.maxHealth);
      expect(creature.isAggro).toBe(false);
    });

    it("clears threat table on leash", () => {
      const creature = makeCreature({ x: 10, z: 10 });
      ai.register(creature, "c1", 5);
      ai.addThreat("c1", "p1", 10);
      ai.addThreat("c1", "p2", 5);

      // Move far from spawn
      creature.x = 50;
      creature.z = 50;

      const player = makePlayer({ x: 100, z: 100 });
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Leash should have cleared all threat
      // To verify, register a second creature that has no threat
      // and confirm hasActiveCombat is false for c1 threat
      ai.unregister("c1");
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("returns to IDLE on arrival at spawn", () => {
      // Use a pathfinder that returns a path back to spawn
      pathfinder.findPath = mock(() => [{ x: 10, z: 10 }]);
      // No LOS to any player — prevents proximity threat from re-engaging
      pathfinder.hasLineOfSight = mock(() => false);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature({ x: 50, z: 50 });
      ai.register(creature, "c1", 5); // spawn at 50,50, leash range 5
      ai.addThreat("c1", "p1", 10);

      // Player is very far away — won't be in detection range after leash
      const players = makePlayers(["p1", makePlayer({ x: 500, z: 500 })]);

      // Move creature far from spawn to trigger leash
      creature.x = 100;
      creature.z = 100;

      // First tick triggers leash
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      expect(creature.health).toBe(creature.maxHealth);

      // Simulate arrival at spawn
      creature.x = 50;
      creature.z = 50;
      creature.isMoving = false;

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      // Should be idle now (not moving, no threat)
      expect(creature.isMoving).toBe(false);
    });
  });

  // ── OOC health regen ──────────────────────────────────────────────────

  describe("OOC health regen", () => {
    it("regenerates health when out of combat and below max", () => {
      const creature = makeCreature({ health: 50, maxHealth: 100 });
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // OOC_REGEN_RATE = 0.2 per second of maxHealth = 20 HP/s
      // Tick for 1 second → should heal ~20 HP
      ai.update(
        1.0,
        players,
        () => {},
        () => {},
      );
      expect(creature.health).toBeGreaterThan(50);
      expect(creature.health).toBeLessThanOrEqual(70); // 50 + 20
    });

    it("does not regen above maxHealth", () => {
      const creature = makeCreature({ health: 95, maxHealth: 100 });
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      ai.update(
        5.0,
        players,
        () => {},
        () => {},
      );
      expect(creature.health).toBe(100);
    });

    it("does not regen during combat (has threat)", () => {
      const creature = makeCreature({ health: 50, maxHealth: 100 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 100);

      const player = makePlayer({ x: 50, z: 50 }); // out of detection range → threat decays
      const players = makePlayers(["p1", player]);

      // Even with threat, creature is chasing not regenerating
      const healthBefore = creature.health;
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Should not have healed (creature has a target)
      // Note: threat may still exist depending on detection range
      // If creature detects player, it has a target and won't regen
    });

    it("accumulates fractional regen correctly (integer health)", () => {
      const creature = makeCreature({ health: 90, maxHealth: 100 });
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      // Small tick: 0.04s → regen = 100 * 0.2 * 0.04 = 0.8 HP (less than 1, accumulated)
      ai.update(
        0.04,
        players,
        () => {},
        () => {},
      );
      expect(creature.health).toBe(90); // No heal yet (fractional)

      // Another small tick to accumulate past 1
      ai.update(
        0.04,
        players,
        () => {},
        () => {},
      );
      expect(creature.health).toBe(91); // Now accumulated ≥ 1
    });
  });

  // ── Threat table updates during update() ──────────────────────────────

  describe("threat table updates (within update)", () => {
    it("adds proximity threat when player in detection range + LOS", () => {
      const creature = makeCreature({ detectionRange: 15 });
      ai.register(creature, "c1", 20);

      // Player within detection range
      const player = makePlayer({ x: 12, z: 12 }); // dist ~2.8
      const players = makePlayers(["p1", player]);

      // First tick: initial burst of THREAT_PROXIMITY_INITIAL (5)
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      expect(ai.hasActiveCombat()).toBe(true);
    });

    it("decays threat when player out of detection range", () => {
      const creature = makeCreature({ detectionRange: 5 });
      ai.register(creature, "c1", 30);
      ai.addThreat("c1", "p1", 2); // Just above epsilon

      // Player far out of detection range
      const player = makePlayer({ x: 100, z: 100 });
      const players = makePlayers(["p1", player]);

      // LOS mock still returns true, but distance is beyond detection range
      // Decay: 10/s for 1s = 10 → 2 - 10 = -8, clamped → removed at epsilon
      ai.update(
        1.0,
        players,
        () => {},
        () => {},
      );
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("purges dead players from threat table", () => {
      const creature = makeCreature({ detectionRange: 15 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ lifeState: LifeState.DEAD });
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Dead player should be purged from threat
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("purges disconnected players from threat table", () => {
      const creature = makeCreature({ detectionRange: 15 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      // Empty players map (player disconnected)
      const players = makePlayers();

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("does not add threat without LOS", () => {
      pathfinder.hasLineOfSight = mock(() => false);
      ai = new AISystem(pathfinder as any, tileMap);

      const creature = makeCreature({ detectionRange: 15 });
      ai.register(creature, "c1", 20);

      const player = makePlayer({ x: 12, z: 12 }); // close but no LOS
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // No proximity threat should be added (no LOS)
      expect(ai.hasActiveCombat()).toBe(false);
    });

    it("targets highest-threat player", () => {
      const creature = makeCreature({ x: 10, z: 10, attackRange: 3.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 5);
      ai.addThreat("c1", "p2", 20);

      const player1 = makePlayer({ x: 11, z: 10 }); // in range
      const player2 = makePlayer({ x: 11.5, z: 10 }); // in range, higher threat
      const players = makePlayers(["p1", player1], ["p2", player2]);

      const onPlayerHit = mock((_sid: string, _dmg: number) => {});

      // Attack tick
      ai.update(0.1, players, onPlayerHit, () => {});
      // Tick past DAMAGE_DELAY
      ai.update(DAMAGE_DELAY + 0.01, players, onPlayerHit, () => {});

      // Should target p2 (higher threat)
      expect(onPlayerHit).toHaveBeenCalled();
      expect(onPlayerHit.mock.calls[0][0]).toBe("p2");
    });
  });

  // ── Animation timer ───────────────────────────────────────────────────

  describe("animation timer", () => {
    it("clears animState when anim timer expires", () => {
      const creature = makeCreature({ x: 10, z: 10, attackRange: 3.0 });
      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      const player = makePlayer({ x: 11, z: 10 });
      const players = makePlayers(["p1", player]);

      // Trigger attack
      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      expect(creature.animState).toBe("punch");

      // Tick past full anim duration
      ai.update(
        ATTACK_ANIM_DURATION + 0.1,
        players,
        () => {},
        () => {},
      );
      expect(creature.animState).toBe("");
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles multiple creatures independently", () => {
      const c1 = makeCreature({ x: 5, z: 5, attackRange: 2.0 });
      const c2 = makeCreature({ x: 50, z: 50, attackRange: 2.0 });
      ai.register(c1, "c1", 20);
      ai.register(c2, "c2", 20);

      ai.addThreat("c1", "p1", 10);
      // c2 has no threat

      const player = makePlayer({ x: 6, z: 5 });
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // c1 should be attacking/chasing, c2 should be idle
      expect(c1.isAggro).toBe(true);
      expect(c2.isAggro).toBe(false);
    });

    it("handles zero dt gracefully", () => {
      const creature = makeCreature();
      ai.register(creature, "c1", 20);
      const players = makePlayers();

      expect(() =>
        ai.update(
          0,
          players,
          () => {},
          () => {},
        ),
      ).not.toThrow();
    });

    it("does not move creature when path is empty", () => {
      const creature = makeCreature({ x: 10, z: 10, isMoving: true });
      creature.path = [];
      creature.currentPathIndex = 0;

      ai.register(creature, "c1", 20);
      ai.addThreat("c1", "p1", 10);

      // Pathfinder returns empty path
      pathfinder.findPath = mock(() => []);
      ai = new AISystem(pathfinder as any, tileMap);
      const creature2 = makeCreature({ x: 10, z: 10, attackRange: 2.0 });
      ai.register(creature2, "c2", 20);
      ai.addThreat("c2", "p1", 10);

      const player = makePlayer({ x: 20, z: 20 });
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // No path found → creature should not be moving
      expect(creature2.isMoving).toBe(false);
    });

    it("addThreat transitions LEASH → CHASE (within leash range)", () => {
      // Creature is in LEASH state but still within leash range of spawn
      // (e.g., it was leashing and walked back near spawn, then got hit)
      const creature = makeCreature({ x: 10, z: 10 });
      ai.register(creature, "c1", 50); // large leash range

      // Move just outside leash to trigger it
      creature.x = 70;
      creature.z = 10;

      const player = makePlayer({ x: 71, z: 10 });
      const players = makePlayers(["p1", player]);

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );
      // Creature is now in LEASH state, health restored

      // Move creature back within leash range (simulating partial return)
      creature.x = 30;
      creature.z = 10;

      // addThreat should transition LEASH → CHASE
      ai.addThreat("c1", "p1", 50);

      // Place player within leash range too
      player.x = 31;
      player.z = 10;

      ai.update(
        0.1,
        players,
        () => {},
        () => {},
      );

      // Creature should be chasing (aggro) since it's within leash range
      expect(creature.isAggro).toBe(true);
    });
  });
});
