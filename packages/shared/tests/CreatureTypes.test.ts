import { describe, it, expect } from "bun:test";
import { scaleCreatureDerivedStats, computeCreatureDerivedStats } from "../src/CreatureTypes.js";
import type { CreatureTypeDefinition } from "../src/CreatureTypes.js";
import type { DerivedStats } from "../src/Stats.js";

const baseStats: DerivedStats = {
  maxHealth: 100,
  attackDamage: 10,
  defense: 5,
  moveSpeed: 4,
  attackCooldown: 1.0,
  attackRange: 2.5,
};

describe("scaleCreatureDerivedStats", () => {
  it("level 1 returns unmodified stats", () => {
    const result = scaleCreatureDerivedStats(baseStats, 1);
    expect(result.maxHealth).toBe(100);
    expect(result.attackDamage).toBe(10);
    expect(result.defense).toBe(5);
    expect(result.moveSpeed).toBe(4);
    expect(result.attackCooldown).toBe(1.0);
    expect(result.attackRange).toBe(2.5);
  });

  it("level 10 scales HP/ATK/DEF by 2.8x (1 + 9*0.2)", () => {
    const result = scaleCreatureDerivedStats(baseStats, 10);
    // scale = 1 + 9 * 0.2 = 2.8
    expect(result.maxHealth).toBe(Math.round(100 * 2.8)); // 280
    expect(result.attackDamage).toBe(Math.round(10 * 2.8)); // 28
    expect(result.defense).toBe(Math.round(5 * 2.8)); // 14
  });

  it("speed, cooldown, and range are unchanged at any level", () => {
    const result = scaleCreatureDerivedStats(baseStats, 10);
    expect(result.moveSpeed).toBe(4);
    expect(result.attackCooldown).toBe(1.0);
    expect(result.attackRange).toBe(2.5);
  });
});

// ── computeCreatureDerivedStats ─────────────────────────────────────────────

function makeCreatureType(overrides: Partial<CreatureTypeDefinition> = {}): CreatureTypeDefinition {
  return {
    id: "zombie",
    name: "Zombie",
    baseStats: { strength: 8, vitality: 6, agility: 4 },
    overrides: {},
    detectionRange: 10,
    attackRange: 2.0,
    leashRange: 15,
    skin: "zombie",
    minLevel: 1,
    maxLevel: 0,
    isBoss: false,
    ...overrides,
  };
}

describe("computeCreatureDerivedStats", () => {
  it("computes derived stats from base stats and sets attackRange from definition", () => {
    const typeDef = makeCreatureType({ attackRange: 3.5 });
    const result = computeCreatureDerivedStats(typeDef);

    // attackRange should come from the definition, not the formula
    expect(result.attackRange).toBe(3.5);
    // maxHealth should be computed from formula: round(50 + 6*5) = 80
    expect(result.maxHealth).toBe(80);
    // attackDamage: round(5 + 8*0.5) = 9
    expect(result.attackDamage).toBe(9);
  });

  it("applies overrides on top of formula values", () => {
    const typeDef = makeCreatureType({
      overrides: { maxHealth: 200, defense: 15 },
    });
    const result = computeCreatureDerivedStats(typeDef);

    // Overrides replace formula-computed values
    expect(result.maxHealth).toBe(200);
    expect(result.defense).toBe(15);
    // Non-overridden stats still use the formula
    expect(result.attackDamage).toBe(9); // round(5 + 8*0.5)
    // attackRange comes from definition
    expect(result.attackRange).toBe(2.0);
  });

  it("attackRange override in overrides is itself overridden by definition attackRange", () => {
    // The spread order is: ...derived, ...overrides, attackRange: typeDef.attackRange
    // So attackRange from overrides gets overridden by the explicit assignment
    const typeDef = makeCreatureType({
      attackRange: 4.0,
      overrides: { attackRange: 99 },
    });
    const result = computeCreatureDerivedStats(typeDef);
    expect(result.attackRange).toBe(4.0);
  });
});
