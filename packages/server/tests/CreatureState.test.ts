import { describe, it, expect, beforeEach } from "bun:test";
import { CreatureState } from "../src/state/CreatureState.js";
import type { DerivedStats } from "@dungeon/shared";
import { scaleCreatureDerivedStats, CREATURE_STAT_SCALE_PER_LEVEL } from "@dungeon/shared";

const baseDerived: DerivedStats = {
  maxHealth: 100,
  attackDamage: 10,
  defense: 3,
  moveSpeed: 4,
  attackCooldown: 1.5,
  attackRange: 2.5,
};

describe("CreatureState", () => {
  let creature: CreatureState;

  beforeEach(() => {
    creature = new CreatureState();
  });

  describe("applyStats()", () => {
    it("applies unscaled stats at level 1", () => {
      creature.applyStats(baseDerived, 1);

      // At level 1, scaleCreatureDerivedStats returns the input unchanged
      expect(creature.level).toBe(1);
      expect(creature.maxHealth).toBe(baseDerived.maxHealth);
      expect(creature.health).toBe(baseDerived.maxHealth);
      expect(creature.baseSpeed).toBe(baseDerived.moveSpeed);
      expect(creature.speed).toBe(baseDerived.moveSpeed);
      expect(creature.attackDamage).toBe(baseDerived.attackDamage);
      expect(creature.defense).toBe(baseDerived.defense);
      expect(creature.attackCooldown).toBe(baseDerived.attackCooldown);
      expect(creature.attackRange).toBe(baseDerived.attackRange);
    });

    it("applies scaled stats at level 10", () => {
      creature.applyStats(baseDerived, 10);

      const scale = 1 + (10 - 1) * CREATURE_STAT_SCALE_PER_LEVEL; // 1 + 9 * 0.2 = 2.8
      expect(creature.level).toBe(10);
      expect(creature.maxHealth).toBe(Math.round(baseDerived.maxHealth * scale));
      expect(creature.health).toBe(Math.round(baseDerived.maxHealth * scale));
      expect(creature.attackDamage).toBe(Math.round(baseDerived.attackDamage * scale));
      expect(creature.defense).toBe(Math.round(baseDerived.defense * scale));

      // Speed, cooldown, range are NOT scaled
      expect(creature.baseSpeed).toBe(baseDerived.moveSpeed);
      expect(creature.speed).toBe(baseDerived.moveSpeed);
      expect(creature.attackCooldown).toBe(baseDerived.attackCooldown);
      expect(creature.attackRange).toBe(baseDerived.attackRange);
    });

    it("sets health equal to maxHealth", () => {
      creature.applyStats(baseDerived, 5);
      expect(creature.health).toBe(creature.maxHealth);
    });
  });
});
