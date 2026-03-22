import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { EffectDef, StatModifier, TalentStatModifier } from "@dungeon/shared";
import { StackBehavior, StatModType } from "@dungeon/shared";
// ── Module mocks ─────────────────────────────────────────────────────────────
// Mock the registries that EffectSystem imports so we avoid DB/boot dependencies.
// NOTE: We do NOT mock ItemInstanceRegistry — its getInstance() reads from an
// in-memory Map (no DB calls), and returns undefined when nothing is cached,
// which is correct for tests without equipment.

let mockEffectDefs: Map<string, EffectDef>;
let mockTalentMods: TalentStatModifier[];

mock.module("../src/effects/EffectRegistry.js", () => ({
  getEffectDef: (id: string) => mockEffectDefs.get(id) ?? null,
}));

mock.module("../src/talents/TalentRegistry.js", () => ({
  collectTalentStatMods: () => mockTalentMods,
}));

// Import AFTER mocks are set up
import { EffectSystem } from "../src/systems/EffectSystem.js";
import { PlayerState } from "../src/state/PlayerState.js";
import { EquipmentSlotState } from "../src/state/EquipmentSlotState.js";
import { registerInstance } from "../src/items/ItemInstanceRegistry.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEffectDef(overrides: Partial<EffectDef> = {}): EffectDef {
  return {
    id: "test_effect",
    name: "Test Effect",
    description: "A test effect",
    icon: "test",
    duration: 5,
    maxStacks: 1,
    stackBehavior: StackBehavior.REFRESH,
    isDebuff: true,
    statModifiers: {},
    tickEffect: null,
    scaling: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EffectSystem", () => {
  let system: EffectSystem;
  let player: PlayerState;

  beforeEach(() => {
    system = new EffectSystem();
    player = new PlayerState();
    // Set base stats so recomputeStats has sensible defaults
    player.strength = 10;
    player.vitality = 10;
    player.agility = 10;
    player.health = 100;

    mockEffectDefs = new Map();
    mockTalentMods = [];
  });

  // ── applyEffect ──────────────────────────────────────────────────────────

  describe("applyEffect()", () => {
    it("creates a new ActiveEffectState on the player", () => {
      mockEffectDefs.set("weakness", makeEffectDef({ id: "weakness", duration: 5, maxStacks: 1 }));

      system.applyEffect(player, "weakness");
      expect(player.effects.size).toBe(1);

      const effect = player.effects.get("weakness");
      expect(effect).toBeDefined();
      expect(effect!.effectId).toBe("weakness");
      expect(effect!.remaining).toBe(5);
      expect(effect!.duration).toBe(5);
      expect(effect!.stacks).toBe(1);
    });

    it("does nothing when effectId is not found in registry", () => {
      system.applyEffect(player, "nonexistent");
      expect(player.effects.size).toBe(0);
    });

    it("refreshes timer on REFRESH stack behavior", () => {
      mockEffectDefs.set(
        "weakness",
        makeEffectDef({
          id: "weakness",
          duration: 5,
          stackBehavior: StackBehavior.REFRESH,
          maxStacks: 3,
        }),
      );

      system.applyEffect(player, "weakness");
      // Simulate time passing
      player.effects.get("weakness")!.remaining = 2;

      // Re-apply — should refresh to full duration
      system.applyEffect(player, "weakness");
      expect(player.effects.get("weakness")!.remaining).toBe(5);
      // Stacks should NOT increase with REFRESH
      expect(player.effects.get("weakness")!.stacks).toBe(1);
    });

    it("adds stacks on INTENSITY stack behavior up to maxStacks", () => {
      mockEffectDefs.set(
        "bleed",
        makeEffectDef({
          id: "bleed",
          duration: 10,
          stackBehavior: StackBehavior.INTENSITY,
          maxStacks: 3,
        }),
      );

      system.applyEffect(player, "bleed", 1);
      expect(player.effects.get("bleed")!.stacks).toBe(1);

      system.applyEffect(player, "bleed", 1);
      expect(player.effects.get("bleed")!.stacks).toBe(2);

      system.applyEffect(player, "bleed", 1);
      expect(player.effects.get("bleed")!.stacks).toBe(3);

      // Should cap at maxStacks
      system.applyEffect(player, "bleed", 1);
      expect(player.effects.get("bleed")!.stacks).toBe(3);
    });

    it("upgrades scalingFactor when re-applied with a higher value", () => {
      const scalingConfig = {
        duration: 10,
        statModifiers: { attackDamage: { value: -0.5 } },
      };
      const attackMod: StatModifier = { type: StatModType.PERCENT, value: -0.25 };
      mockEffectDefs.set(
        "scaled_debuff",
        makeEffectDef({
          id: "scaled_debuff",
          duration: 5,
          statModifiers: { attackDamage: attackMod },
          scaling: scalingConfig,
        }),
      );

      // Apply with low scaling
      system.applyEffect(player, "scaled_debuff", 1, 0.2);
      const effect = player.effects.get("scaled_debuff")!;
      expect(effect.scalingFactor).toBe(0.2);
      const firstModValue = effect.modValue;

      // Re-apply with higher scaling — should upgrade
      system.applyEffect(player, "scaled_debuff", 1, 0.8);
      expect(effect.scalingFactor).toBe(0.8);
      // modValue should change because scaling is now stronger
      expect(effect.modValue).not.toBe(firstModValue);
    });

    it("does not downgrade scalingFactor when re-applied with a lower value", () => {
      const scalingConfig = {
        duration: 10,
        statModifiers: { attackDamage: { value: -0.5 } },
      };
      const attackMod: StatModifier = { type: StatModType.PERCENT, value: -0.25 };
      mockEffectDefs.set(
        "scaled_debuff2",
        makeEffectDef({
          id: "scaled_debuff2",
          duration: 5,
          statModifiers: { attackDamage: attackMod },
          scaling: scalingConfig,
        }),
      );

      system.applyEffect(player, "scaled_debuff2", 1, 0.8);
      const effect = player.effects.get("scaled_debuff2")!;
      expect(effect.scalingFactor).toBe(0.8);

      // Re-apply with lower scaling — should NOT downgrade
      system.applyEffect(player, "scaled_debuff2", 1, 0.2);
      expect(effect.scalingFactor).toBe(0.8);
    });

    it("applies stat modifier effect and changes player stats via recomputeStats", () => {
      const attackMod: StatModifier = { type: StatModType.PERCENT, value: -0.25 };
      mockEffectDefs.set(
        "weakness",
        makeEffectDef({
          id: "weakness",
          duration: 5,
          statModifiers: { attackDamage: attackMod },
        }),
      );

      // Get baseline attackDamage without effects
      system.recomputeStats(player);
      const baseAttack = player.attackDamage;

      system.applyEffect(player, "weakness");
      // attackDamage should be reduced by 25%
      // Formula: (base + flat) * (1 + percent) = base * 0.75
      const expected = Math.max(0, Math.round(baseAttack * 0.75));
      expect(player.attackDamage).toBe(expected);
    });
  });

  // ── clearEffects ─────────────────────────────────────────────────────────

  describe("clearEffects()", () => {
    it("removes all effects from the player", () => {
      mockEffectDefs.set("eff1", makeEffectDef({ id: "eff1", duration: 5 }));
      mockEffectDefs.set("eff2", makeEffectDef({ id: "eff2", duration: 10 }));

      system.applyEffect(player, "eff1");
      system.applyEffect(player, "eff2");
      expect(player.effects.size).toBe(2);

      system.clearEffects(player);
      expect(player.effects.size).toBe(0);
    });

    it("does nothing when no effects exist", () => {
      // Should not throw
      system.clearEffects(player);
      expect(player.effects.size).toBe(0);
    });
  });

  // ── removeEffect ─────────────────────────────────────────────────────────

  describe("removeEffect()", () => {
    it("removes a specific effect by id", () => {
      mockEffectDefs.set("eff1", makeEffectDef({ id: "eff1", duration: 5 }));
      mockEffectDefs.set("eff2", makeEffectDef({ id: "eff2", duration: 10 }));

      system.applyEffect(player, "eff1");
      system.applyEffect(player, "eff2");

      system.removeEffect(player, "eff1");
      expect(player.effects.size).toBe(1);
      expect(player.effects.has("eff1")).toBe(false);
      expect(player.effects.has("eff2")).toBe(true);
    });

    it("does nothing if effect not present", () => {
      system.removeEffect(player, "nonexistent");
      expect(player.effects.size).toBe(0);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe("update()", () => {
    it("ticks down effect remaining timer", () => {
      mockEffectDefs.set("buff", makeEffectDef({ id: "buff", duration: 5 }));
      system.applyEffect(player, "buff");

      const players = new Map<string, PlayerState>();
      players.set("p1", player);

      system.update(1.0, players);
      expect(player.effects.get("buff")!.remaining).toBeCloseTo(4.0, 2);
    });

    it("removes expired effects", () => {
      mockEffectDefs.set("buff", makeEffectDef({ id: "buff", duration: 2 }));
      system.applyEffect(player, "buff");

      const players = new Map<string, PlayerState>();
      players.set("p1", player);

      // Tick past the duration
      system.update(3.0, players);
      expect(player.effects.size).toBe(0);
    });

    it("processes tick effects (heal over time)", () => {
      mockEffectDefs.set(
        "regen",
        makeEffectDef({
          id: "regen",
          duration: 10,
          tickEffect: { type: "heal", value: 8, interval: 2 },
        }),
      );

      // Set up player with reduced health
      system.recomputeStats(player);
      player.health = 50;

      system.applyEffect(player, "regen");

      const players = new Map<string, PlayerState>();
      players.set("p1", player);

      // After 2 seconds, one tick should fire (heal 8)
      system.update(2.0, players);
      expect(player.health).toBe(58);
    });

    it("does not heal above maxHealth", () => {
      mockEffectDefs.set(
        "regen",
        makeEffectDef({
          id: "regen",
          duration: 10,
          tickEffect: { type: "heal", value: 50, interval: 1 },
        }),
      );

      system.recomputeStats(player);
      const maxHp = player.maxHealth;
      player.health = maxHp - 5;

      system.applyEffect(player, "regen");

      const players = new Map<string, PlayerState>();
      players.set("p1", player);

      system.update(1.0, players);
      expect(player.health).toBe(maxHp);
    });

    it("skips players with no effects", () => {
      const players = new Map<string, PlayerState>();
      players.set("p1", player);

      // Should not throw
      system.update(1.0, players);
    });
  });

  // ── recomputeStats ───────────────────────────────────────────────────────

  describe("recomputeStats()", () => {
    it("computes correct derived stats with no effects or equipment", () => {
      // Base 10/10/10 with PLAYER_SCALING:
      // maxHealth = round(50 + 10*5) = 100
      // attackDamage = round(5 + 10*0.5) = 10
      // defense = round(0 + 10*0.3) = 3
      // speed = 4 + 10*0.1 = 5
      // attackCooldown = max(0.3, 1.2 - 10*0.02) = 1.0
      // attackRange = 2.5
      system.recomputeStats(player);

      expect(player.maxHealth).toBe(100);
      expect(player.attackDamage).toBe(10);
      expect(player.defense).toBe(3);
      expect(player.speed).toBeCloseTo(5.0, 2);
      expect(player.attackCooldown).toBeCloseTo(1.0, 2);
      expect(player.attackRange).toBe(2.5);
    });

    it("clamps health when maxHealth decreases", () => {
      system.recomputeStats(player);
      player.health = player.maxHealth; // 100

      // Apply a debuff that reduces maxHealth
      const hpMod: StatModifier = { type: StatModType.PERCENT, value: -0.5 };
      mockEffectDefs.set(
        "curse",
        makeEffectDef({
          id: "curse",
          duration: 10,
          statModifiers: { maxHealth: hpMod },
        }),
      );
      system.applyEffect(player, "curse");

      // maxHealth = round(100 * 0.5) = 50, health should clamp
      expect(player.maxHealth).toBe(50);
      expect(player.health).toBe(50);
    });

    it("applies flat modifiers from effects", () => {
      const flatDef: StatModifier = { type: StatModType.FLAT, value: 20 };
      mockEffectDefs.set(
        "fortify",
        makeEffectDef({
          id: "fortify",
          duration: 10,
          statModifiers: { maxHealth: flatDef },
        }),
      );

      system.recomputeStats(player);
      const baseHP = player.maxHealth; // 100

      system.applyEffect(player, "fortify");
      // maxHealth = round((100 + 20) * 1) = 120
      expect(player.maxHealth).toBe(baseHP + 20);
    });

    it("applies equipment base stat bonuses (strength) before class scaling", () => {
      // Register an item instance with +5 strength
      const instanceId = "test-equip-str-001";
      registerInstance({
        id: instanceId,
        itemId: "iron_sword",
        rolledStats: { strength: 5 },
        itemLevel: 1,
      });

      // Equip it
      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = instanceId;
      player.equipment.set("weapon", eqSlot);

      system.recomputeStats(player);

      // Without equipment: base str=10, attackDamage = round(5 + 10*0.5) = 10
      // With +5 str equipment: attackDamage = round(5 + 15*0.5) = round(12.5) = 13
      // Also maxHealth changes: round(50 + 10*5) = 100 without, still 100 (vitality unchanged)
      expect(player.attackDamage).toBeGreaterThan(10);
    });

    it("applies equipment derived stat bonuses as flat mods", () => {
      // Register an item instance with +10 maxHealth (derived stat, applied as flat mod)
      const instanceId = "test-equip-hp-001";
      registerInstance({
        id: instanceId,
        itemId: "iron_chest",
        rolledStats: { maxHealth: 10 },
        itemLevel: 1,
      });

      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = instanceId;
      player.equipment.set("chest", eqSlot);

      system.recomputeStats(player);

      // Base maxHealth = 100, +10 flat from equipment = 110
      expect(player.maxHealth).toBe(110);
    });

    it("applies percent talent mods correctly", () => {
      // Talent: +20% maxHealth
      mockTalentMods = [{ stat: "maxHealth", type: StatModType.PERCENT, value: 0.2 }];

      system.recomputeStats(player);

      // Base maxHealth = 100, with +20% = round(100 * 1.2) = 120
      expect(player.maxHealth).toBe(120);
    });

    it("applies flat talent mods correctly", () => {
      // Talent: +5 attackDamage flat
      mockTalentMods = [{ stat: "attackDamage", type: StatModType.FLAT, value: 5 }];

      system.recomputeStats(player);

      // Base attackDamage = 10, +5 flat = round((10 + 5) * 1) = 15
      expect(player.attackDamage).toBe(15);
    });

    it("applies both flat and percent mods: stat = (base + flat) * (1 + percent)", () => {
      // Flat +10 attackDamage from talent, -25% from effect
      mockTalentMods = [{ stat: "attackDamage", type: StatModType.FLAT, value: 10 }];

      const attackDebuff: StatModifier = { type: StatModType.PERCENT, value: -0.25 };
      mockEffectDefs.set(
        "weaken",
        makeEffectDef({
          id: "weaken",
          duration: 10,
          statModifiers: { attackDamage: attackDebuff },
        }),
      );

      system.recomputeStats(player);
      // Base attackDamage = 10, +10 flat from talent = 20
      // Without effect: 20
      expect(player.attackDamage).toBe(20);

      system.applyEffect(player, "weaken");
      // With -25%: round((10 + 10) * 0.75) = round(15) = 15
      expect(player.attackDamage).toBe(15);
    });
  });
});
