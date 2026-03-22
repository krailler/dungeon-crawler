import { describe, it, expect } from "bun:test";
import {
  computeDerivedStats,
  computeDamage,
  PLAYER_SCALING,
  DEFAULT_PLAYER_STATS,
} from "../src/Stats.js";

describe("computeDerivedStats", () => {
  it("computes default stats (10/10/10)", () => {
    const d = computeDerivedStats(DEFAULT_PLAYER_STATS);
    expect(d.maxHealth).toBe(100);
    expect(d.attackDamage).toBe(10);
    expect(d.defense).toBe(3);
    expect(d.moveSpeed).toBeCloseTo(5, 5);
    expect(d.attackCooldown).toBeCloseTo(1.0, 5);
    expect(d.attackRange).toBe(2.5);
  });

  it("handles zero stats", () => {
    const d = computeDerivedStats({ strength: 0, vitality: 0, agility: 0 });
    expect(d.maxHealth).toBe(50);
    expect(d.attackDamage).toBe(5);
    expect(d.defense).toBe(0);
    expect(d.moveSpeed).toBeCloseTo(4, 5);
    expect(d.attackCooldown).toBeCloseTo(1.2, 5);
  });

  it("scales with high vitality", () => {
    const d = computeDerivedStats({ strength: 10, vitality: 50, agility: 10 });
    expect(d.maxHealth).toBe(Math.round(50 + 50 * 5)); // 300
    expect(d.defense).toBe(Math.round(0 + 50 * 0.3)); // 15
  });

  it("clamps attackCooldown to MIN_ATTACK_COOLDOWN (0.3)", () => {
    const d = computeDerivedStats({ strength: 10, vitality: 10, agility: 200 });
    expect(d.attackCooldown).toBeCloseTo(0.3, 5);
  });

  it("accepts custom scaling", () => {
    const scaling = {
      ...PLAYER_SCALING,
      healthBase: 100,
      healthPerVit: 10,
    };
    const d = computeDerivedStats({ strength: 5, vitality: 5, agility: 5 }, scaling);
    expect(d.maxHealth).toBe(Math.round(100 + 5 * 10)); // 150
  });
});

describe("computeDamage", () => {
  it("computes normal damage", () => {
    expect(computeDamage(10, 3)).toBe(7);
  });

  it("returns minimum 1 when defense >= attack", () => {
    expect(computeDamage(5, 10)).toBe(1);
    expect(computeDamage(5, 5)).toBe(1);
  });

  it("ignores negative defense (treated as 0)", () => {
    expect(computeDamage(10, -5)).toBe(10);
  });

  it("handles zero defense", () => {
    expect(computeDamage(15, 0)).toBe(15);
  });
});
