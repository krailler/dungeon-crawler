import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { SkillDef } from "@dungeon/shared";
import { LifeState, GCD_DURATION, ATTACK_ANIM_DURATION } from "@dungeon/shared";

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mock registries that CombatSystem imports to avoid DB/boot dependencies.

let mockSkillDefs: Map<string, SkillDef>;
let mockDefaultSkill: SkillDef | null;
let mockTalentMods: { cooldownMul: number; damageMul: number };

mock.module("../src/skills/SkillRegistry.js", () => ({
  getSkillDef: (id: string) => mockSkillDefs.get(id) ?? null,
}));

mock.module("../src/classes/ClassRegistry.js", () => ({
  getClassDefaultSkill: () => mockDefaultSkill,
}));

mock.module("../src/talents/TalentRegistry.js", () => ({
  collectTalentSkillMods: () => mockTalentMods,
}));

mock.module("../src/logger.js", () => ({
  logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
}));

// Import AFTER mocks are set up
import { CombatSystem } from "../src/systems/CombatSystem.js";
import type { CombatHitEvent } from "../src/systems/CombatSystem.js";
import { PlayerState } from "../src/state/PlayerState.js";
import { CreatureState } from "../src/state/CreatureState.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSkillDef(overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    id: "test_skill",
    name: "Test Skill",
    description: "A test skill",
    icon: "test",
    passive: false,
    cooldown: 5,
    damageMultiplier: 2.0,
    animState: "heavy_punch",
    hpThreshold: 0,
    resetOnKill: false,
    effectId: "",
    aoeRange: 0,
    animDuration: ATTACK_ANIM_DURATION,
    ...overrides,
  };
}

function makeDefaultSkill(): SkillDef {
  return makeSkillDef({
    id: "basic_attack",
    name: "Basic Attack",
    passive: true,
    cooldown: 0,
    damageMultiplier: 1.0,
    animState: "punch",
    animDuration: ATTACK_ANIM_DURATION,
  });
}

/** Create a player positioned at origin, facing +Z, alive and ready to fight. */
function makePlayer(overrides: Partial<{ x: number; z: number; rotY: number }> = {}): PlayerState {
  const p = new PlayerState();
  p.x = overrides.x ?? 0;
  p.z = overrides.z ?? 0;
  p.rotY = overrides.rotY ?? 0;
  p.lifeState = LifeState.ALIVE;
  p.online = true;
  p.autoAttackEnabled = true;
  p.attackDamage = 10;
  p.defense = 2;
  p.attackCooldown = 1.0;
  p.attackRange = 2.5;
  p.classId = "warrior";
  p.health = 100;
  p.maxHealth = 100;
  return p;
}

/** Create a creature at the given position. */
function makeCreature(
  x: number,
  z: number,
  overrides: Partial<{ health: number; maxHealth: number; defense: number; isDead: boolean }> = {},
): CreatureState {
  const c = new CreatureState();
  c.x = x;
  c.z = z;
  c.health = overrides.health ?? 50;
  c.maxHealth = overrides.maxHealth ?? 50;
  c.defense = overrides.defense ?? 3;
  c.isDead = overrides.isDead ?? false;
  return c;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("CombatSystem", () => {
  let system: CombatSystem;

  beforeEach(() => {
    system = new CombatSystem();
    mockSkillDefs = new Map();
    mockDefaultSkill = makeDefaultSkill();
    mockTalentMods = { cooldownMul: 1, damageMul: 1 };
  });

  // ── registerPlayer / removePlayer ──────────────────────────────────────────

  describe("registerPlayer / removePlayer", () => {
    it("registers a player and allows target operations", () => {
      system.registerPlayer("s1");
      // Should be able to set a target without error
      system.setTarget("s1", "c1");
      expect(system.getTarget("s1")).toBe("c1");
    });

    it("removePlayer clears all tracking for the session", () => {
      system.registerPlayer("s1");
      system.setTarget("s1", "c1");
      system.removePlayer("s1");
      expect(system.getTarget("s1")).toBeNull();
    });
  });

  // ── setTarget ──────────────────────────────────────────────────────────────

  describe("setTarget", () => {
    it("sets the target creature id for a player", () => {
      system.registerPlayer("s1");
      system.setTarget("s1", "creature_42");
      expect(system.getTarget("s1")).toBe("creature_42");
    });

    it("clears the target when null is passed", () => {
      system.registerPlayer("s1");
      system.setTarget("s1", "creature_42");
      system.setTarget("s1", null);
      expect(system.getTarget("s1")).toBeNull();
    });

    it("does nothing for an unregistered session", () => {
      // Should not throw
      system.setTarget("unknown", "c1");
    });
  });

  // ── clearTargetFor ─────────────────────────────────────────────────────────

  describe("clearTargetFor", () => {
    it("clears the target for all players targeting a specific creature", () => {
      system.registerPlayer("s1");
      system.registerPlayer("s2");
      system.registerPlayer("s3");
      system.setTarget("s1", "c1");
      system.setTarget("s2", "c1");
      system.setTarget("s3", "c2");

      system.clearTargetFor("c1");

      expect(system.getTarget("s1")).toBeNull();
      expect(system.getTarget("s2")).toBeNull();
      expect(system.getTarget("s3")).toBe("c2"); // unaffected
    });
  });

  // ── clearCooldowns ─────────────────────────────────────────────────────────

  describe("clearCooldowns", () => {
    it("resets all skill cooldowns for a player", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      // Use the skill to put it on cooldown
      const result = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(result).not.toBeNull();
      expect(system.getSkillCooldown("s1", "heavy_strike")).toBeGreaterThan(0);

      system.clearCooldowns("s1");
      expect(system.getSkillCooldown("s1", "heavy_strike")).toBe(0);
    });
  });

  // ── getSkillCooldown ───────────────────────────────────────────────────────

  describe("getSkillCooldown", () => {
    it("returns 0 for a skill not on cooldown", () => {
      system.registerPlayer("s1");
      expect(system.getSkillCooldown("s1", "any_skill")).toBe(0);
    });

    it("returns 0 for an unregistered session", () => {
      expect(system.getSkillCooldown("unknown", "any_skill")).toBe(0);
    });
  });

  // ── useSkill ───────────────────────────────────────────────────────────────

  describe("useSkill", () => {
    it("returns null if player is not registered", () => {
      const player = makePlayer();
      const creatures = new Map<string, CreatureState>();
      const result = system.useSkill("unknown", "test_skill", player, creatures);
      expect(result).toBeNull();
    });

    it("returns null if player is not alive", () => {
      const player = makePlayer();
      player.lifeState = LifeState.DOWNED;
      system.registerPlayer("s1");

      mockSkillDefs.set("test_skill", makeSkillDef());
      player.skills.push("test_skill");

      const result = system.useSkill("s1", "test_skill", player, new Map());
      expect(result).toBeNull();
    });

    it("returns null if skill def is not found", () => {
      const player = makePlayer();
      system.registerPlayer("s1");
      const result = system.useSkill("s1", "nonexistent", player, new Map());
      expect(result).toBeNull();
    });

    it("returns null if skill is passive", () => {
      const player = makePlayer();
      system.registerPlayer("s1");
      mockSkillDefs.set("passive_skill", makeSkillDef({ id: "passive_skill", passive: true }));
      player.skills.push("passive_skill");

      const result = system.useSkill("s1", "passive_skill", player, new Map());
      expect(result).toBeNull();
    });

    it("returns null if skill has no cooldown", () => {
      const player = makePlayer();
      system.registerPlayer("s1");
      mockSkillDefs.set("no_cd", makeSkillDef({ id: "no_cd", cooldown: 0 }));
      player.skills.push("no_cd");

      const result = system.useSkill("s1", "no_cd", player, new Map());
      expect(result).toBeNull();
    });

    it("returns null if skill is on cooldown", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      // First use succeeds
      const first = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(first).not.toBeNull();

      // Second use fails — on cooldown
      const second = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(second).toBeNull();
    });

    it("returns null if player does not have the skill", () => {
      const player = makePlayer();
      system.registerPlayer("s1");
      mockSkillDefs.set("test_skill", makeSkillDef());
      // Do NOT add the skill to player.skills

      const result = system.useSkill("s1", "test_skill", player, new Map());
      expect(result).toBeNull();
    });

    it("succeeds for a single-target skill with valid target in range", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5, damageMultiplier: 2.5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0)); // within attackRange of 2.5

      const events = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(events).not.toBeNull();
      expect(events!.length).toBeGreaterThanOrEqual(1);
      expect(events![0].skillId).toBe("heavy_strike");
      expect(events![0].duration).toBe(5);

      // Skill should now be on cooldown
      expect(system.getSkillCooldown("s1", "heavy_strike")).toBe(5);
    });

    it("returns null for single-target skill without a target set", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      // No target set

      const result = system.useSkill("s1", "heavy_strike", player, new Map());
      expect(result).toBeNull();
    });

    it("returns null for single-target skill when target is out of range", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(100, 0)); // far away

      const result = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(result).toBeNull();
    });

    it("returns null for single-target skill when target is dead", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0, { isDead: true }));

      const result = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(result).toBeNull();
    });

    it("succeeds for a buff skill without needing a target", () => {
      const player = makePlayer();
      const buff = makeSkillDef({
        id: "war_cry",
        cooldown: 25,
        damageMultiplier: 0,
        effectId: "war_cry_buff",
        animState: "heavy_punch",
      });
      mockSkillDefs.set("war_cry", buff);
      player.skills.push("war_cry");

      system.registerPlayer("s1");
      // No target set — buff skills don't need one

      const events = system.useSkill("s1", "war_cry", player, new Map());
      expect(events).not.toBeNull();
      expect(events![0].skillId).toBe("war_cry");
      expect(events![0].duration).toBe(25);
      expect(player.animState).toBe("heavy_punch");
    });

    it("succeeds for an AoE skill without needing a specific target", () => {
      const player = makePlayer();
      const aoe = makeSkillDef({
        id: "ground_slam",
        cooldown: 12,
        damageMultiplier: 1.5,
        aoeRange: 4.0,
        animState: "heavy_punch",
      });
      mockSkillDefs.set("ground_slam", aoe);
      player.skills.push("ground_slam");

      system.registerPlayer("s1");
      // No target set — AoE doesn't need one

      const events = system.useSkill("s1", "ground_slam", player, new Map());
      expect(events).not.toBeNull();
      expect(events![0].skillId).toBe("ground_slam");
      expect(events![0].duration).toBe(12);
    });

    it("respects hpThreshold — rejects if target HP is above threshold", () => {
      const player = makePlayer();
      const execute = makeSkillDef({
        id: "execute",
        cooldown: 10,
        damageMultiplier: 4.0,
        hpThreshold: 0.3,
      });
      mockSkillDefs.set("execute", execute);
      player.skills.push("execute");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      // Creature at full health: 50/50 = 100% > 30%
      creatures.set("c1", makeCreature(1, 0, { health: 50, maxHealth: 50 }));

      const result = system.useSkill("s1", "execute", player, creatures);
      expect(result).toBeNull();
    });

    it("respects hpThreshold — succeeds if target HP is below threshold", () => {
      const player = makePlayer();
      const execute = makeSkillDef({
        id: "execute",
        cooldown: 10,
        damageMultiplier: 4.0,
        hpThreshold: 0.3,
      });
      mockSkillDefs.set("execute", execute);
      player.skills.push("execute");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      // Creature at 10/50 = 20% < 30%
      creatures.set("c1", makeCreature(1, 0, { health: 10, maxHealth: 50 }));

      const events = system.useSkill("s1", "execute", player, creatures);
      expect(events).not.toBeNull();
      expect(events![0].skillId).toBe("execute");
    });

    it("applies GCD to other non-passive skills", () => {
      const player = makePlayer();

      const heavy = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      const execute = makeSkillDef({ id: "execute", cooldown: 10, hpThreshold: 0.3 });
      mockSkillDefs.set("heavy_strike", heavy);
      mockSkillDefs.set("execute", execute);

      player.skills.push("heavy_strike");
      player.skills.push("execute");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      const events = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(events).not.toBeNull();
      // Should have events for heavy_strike AND GCD on execute
      expect(events!.length).toBe(2);
      expect(events![1].skillId).toBe("execute");
      expect(events![1].duration).toBe(GCD_DURATION);

      // execute should be on GCD
      expect(system.getSkillCooldown("s1", "execute")).toBe(GCD_DURATION);
    });

    it("applies talent cooldown and damage multipliers", () => {
      const player = makePlayer();
      player.attackDamage = 20;

      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 10, damageMultiplier: 2.0 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      // Talent reduces cooldown by 20%
      mockTalentMods = { cooldownMul: 0.8, damageMul: 1.5 };

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0, { defense: 0 }));

      const events = system.useSkill("s1", "heavy_strike", player, creatures);
      expect(events).not.toBeNull();

      // Cooldown should be 10 * 0.8 = 8
      expect(events![0].duration).toBe(8);
      expect(system.getSkillCooldown("s1", "heavy_strike")).toBe(8);
    });
  });

  // ── getSkillFailureReason ─────────────────────────────────────────────

  describe("getSkillFailureReason", () => {
    it("returns 'feedback.noTarget' for unregistered player", () => {
      const player = makePlayer();
      const creatures = new Map<string, CreatureState>();
      const reason = system.getSkillFailureReason("unknown", "test_skill", player, creatures);
      expect(reason).toBe("feedback.noTarget");
    });

    it("returns 'feedback.onCooldown' when skill is on cooldown", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      // Use the skill to put it on cooldown
      system.useSkill("s1", "heavy_strike", player, creatures);

      const reason = system.getSkillFailureReason("s1", "heavy_strike", player, creatures);
      expect(reason).toBe("feedback.onCooldown");
    });

    it("returns 'feedback.noTarget' when no target exists", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      // No target set, no creatures

      const reason = system.getSkillFailureReason("s1", "heavy_strike", player, new Map());
      expect(reason).toBe("feedback.noTarget");
    });

    it("returns 'feedback.targetHealthTooHigh' when hpThreshold check fails", () => {
      const player = makePlayer();
      const execute = makeSkillDef({
        id: "execute",
        cooldown: 10,
        damageMultiplier: 4.0,
        hpThreshold: 0.3,
      });
      mockSkillDefs.set("execute", execute);
      player.skills.push("execute");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      // Creature at full health: 50/50 = 100% > 30%
      creatures.set("c1", makeCreature(1, 0, { health: 50, maxHealth: 50 }));

      const reason = system.getSkillFailureReason("s1", "execute", player, creatures);
      expect(reason).toBe("feedback.targetHealthTooHigh");
    });
  });

  // ── update (auto-attack tick) ──────────────────────────────────────────────

  describe("update", () => {
    it("does not auto-attack without a target", () => {
      const player = makePlayer();
      system.registerPlayer("s1");

      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();

      const hits: CombatHitEvent[] = [];
      system.update(1.0, players, creatures, (e) => hits.push(e));
      expect(hits).toHaveLength(0);
    });

    it("auto-attacks a target in range when facing it", () => {
      const player = makePlayer({ x: 0, z: 0 });
      // Face toward +Z (rotY=0 means facing +Z in atan2(dx,dz) convention)
      player.rotY = 0;
      player.attackCooldown = 1.0;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1, { health: 50, maxHealth: 50, defense: 3 });
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      // First update: cooldown ready (starts at 0), should schedule hit
      system.update(0, players, creatures);

      // Player should be animating
      expect(player.animState).toBe("punch");

      // Now tick enough time for the damage to apply (animDuration/2)
      const hits: CombatHitEvent[] = [];
      system.update(ATTACK_ANIM_DURATION / 2 + 0.01, players, creatures, (e) => hits.push(e));

      expect(hits).toHaveLength(1);
      expect(hits[0].sessionId).toBe("s1");
      expect(hits[0].creatureId).toBe("c1");
      expect(hits[0].finalDamage).toBeGreaterThanOrEqual(1);
    });

    it("does not auto-attack when player is dead", () => {
      const player = makePlayer();
      player.lifeState = LifeState.DEAD;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1);
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      const hits: CombatHitEvent[] = [];
      // Tick with enough time for cooldown
      system.update(2.0, players, creatures, (e) => hits.push(e));
      expect(hits).toHaveLength(0);
    });

    it("does not auto-attack when player is offline", () => {
      const player = makePlayer();
      player.online = false;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1);
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      const hits: CombatHitEvent[] = [];
      system.update(2.0, players, creatures, (e) => hits.push(e));
      expect(hits).toHaveLength(0);
    });

    it("does not auto-attack when autoAttackEnabled is false", () => {
      const player = makePlayer();
      player.autoAttackEnabled = false;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1);
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      const hits: CombatHitEvent[] = [];
      system.update(2.0, players, creatures, (e) => hits.push(e));
      expect(hits).toHaveLength(0);
    });

    it("fires onNotFacing when target is behind the player", () => {
      const player = makePlayer({ x: 0, z: 0 });
      // Face +Z but creature is at -Z (behind)
      player.rotY = 0;
      player.attackCooldown = 1.0;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, -1); // behind the player
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      const notFacingSessions: string[] = [];
      system.update(0, players, creatures, undefined, (sid) => notFacingSessions.push(sid));

      expect(notFacingSessions).toContain("s1");
    });

    it("ticks down skill cooldowns over time", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 5 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      // Use skill to set cooldown
      system.useSkill("s1", "heavy_strike", player, creatures);
      expect(system.getSkillCooldown("s1", "heavy_strike")).toBe(5);

      // Tick 2 seconds
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      system.update(2.0, players, creatures);

      expect(system.getSkillCooldown("s1", "heavy_strike")).toBeCloseTo(3.0, 1);
    });

    it("removes skill cooldown once it expires", () => {
      const player = makePlayer();
      const skill = makeSkillDef({ id: "heavy_strike", cooldown: 2 });
      mockSkillDefs.set("heavy_strike", skill);
      player.skills.push("heavy_strike");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", makeCreature(1, 0));

      system.useSkill("s1", "heavy_strike", player, creatures);

      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      // Tick past the cooldown
      system.update(3.0, players, creatures);

      expect(system.getSkillCooldown("s1", "heavy_strike")).toBe(0);
    });

    it("applies damage to creature and marks killed when health reaches 0", () => {
      const player = makePlayer({ x: 0, z: 0 });
      player.rotY = 0;
      player.attackDamage = 100; // very high to guarantee a kill

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1, { health: 5, maxHealth: 50, defense: 0 });
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      // Schedule auto-attack
      system.update(0, players, creatures);

      // Apply damage at animation peak
      const hits: CombatHitEvent[] = [];
      system.update(ATTACK_ANIM_DURATION / 2 + 0.01, players, creatures, (e) => hits.push(e));

      expect(hits).toHaveLength(1);
      expect(hits[0].killed).toBe(true);
      expect(creature.isDead).toBe(true);
      expect(creature.health).toBe(0);
    });

    it("does not apply damage in pacifist mode but still fires onHit", () => {
      const player = makePlayer({ x: 0, z: 0 });
      player.rotY = 0;
      player.attackDamage = 100;
      player.pacifist = true;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1, { health: 50, maxHealth: 50, defense: 0 });
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      // Schedule auto-attack
      system.update(0, players, creatures);

      // Apply damage at animation peak
      const hits: CombatHitEvent[] = [];
      system.update(ATTACK_ANIM_DURATION / 2 + 0.01, players, creatures, (e) => hits.push(e));

      expect(hits).toHaveLength(1);
      expect(hits[0].killed).toBe(false);
      expect(creature.health).toBe(50); // health unchanged
      expect(creature.isDead).toBe(false);
    });

    it("clears animState when animation timer expires", () => {
      const player = makePlayer({ x: 0, z: 0 });
      player.rotY = 0;

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creature = makeCreature(0, 1, { health: 500, maxHealth: 500, defense: 0 });
      const players = new Map<string, PlayerState>();
      players.set("s1", player);
      const creatures = new Map<string, CreatureState>();
      creatures.set("c1", creature);

      // Schedule auto-attack
      system.update(0, players, creatures);
      expect(player.animState).toBe("punch");

      // Tick past the full animation duration
      system.update(ATTACK_ANIM_DURATION + 0.01, players, creatures);
      expect(player.animState).toBe("");
    });

    it("resets skill cooldown on kill when resetOnKill is true", () => {
      const player = makePlayer();
      player.attackDamage = 200;

      const execute = makeSkillDef({
        id: "execute",
        cooldown: 10,
        damageMultiplier: 4.0,
        hpThreshold: 0.3,
        resetOnKill: true,
      });
      mockSkillDefs.set("execute", execute);
      player.skills.push("execute");

      system.registerPlayer("s1");
      system.setTarget("s1", "c1");

      const creatures = new Map<string, CreatureState>();
      // Creature at low health: 5/50 = 10% < 30% threshold
      creatures.set("c1", makeCreature(1, 0, { health: 5, maxHealth: 50, defense: 0 }));

      // Use execute
      const events = system.useSkill("s1", "execute", player, creatures);
      expect(events).not.toBeNull();
      expect(system.getSkillCooldown("s1", "execute")).toBe(10);

      // Tick to apply the damage (kill the creature)
      const players = new Map<string, PlayerState>();
      players.set("s1", player);

      system.update(ATTACK_ANIM_DURATION / 2 + 0.01, players, creatures);

      // Cooldown should be reset because of resetOnKill
      expect(system.getSkillCooldown("s1", "execute")).toBe(0);
    });
  });
});
