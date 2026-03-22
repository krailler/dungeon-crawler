import { describe, it, expect } from "bun:test";
import { xpToNextLevel, computeXpDrop } from "../src/Leveling.js";

describe("xpToNextLevel", () => {
  it("level 1: floor(50 * 1^2) = 50", () => {
    expect(xpToNextLevel(1)).toBe(50);
  });

  it("level 10: floor(50 * 100) = 5000", () => {
    expect(xpToNextLevel(10)).toBe(5000);
  });

  it("returns 0 at max level (30)", () => {
    expect(xpToNextLevel(30)).toBe(0);
  });

  it("returns 0 at level 0", () => {
    expect(xpToNextLevel(0)).toBe(0);
  });

  it("returns 0 for negative level", () => {
    expect(xpToNextLevel(-1)).toBe(0);
  });
});

describe("computeXpDrop", () => {
  it("computes normal XP at same level", () => {
    // baseXp = 20 + 10*6 = 80, modifier = 1.0
    // round(80 * 1.0) = 80
    expect(computeXpDrop(10, 10)).toBe(80);
  });

  it("penalizes XP for low-level creatures", () => {
    // creature 5 vs player 10: diff = -5, modifier = 0.5
    // baseXp = 20 + 5*6 = 50, round(50 * 0.5) = 25
    expect(computeXpDrop(5, 10)).toBe(25);
  });

  it("gives bonus XP for higher-level creatures", () => {
    // creature 15 vs player 10: diff = 5, modifier = 1.25
    // baseXp = 20 + 15*6 = 110, round(110 * 1.25) = 138
    expect(computeXpDrop(15, 10)).toBe(138);
  });

  it("returns minimum 1 XP with anti-farm", () => {
    // creature 1 vs player 20: diff = -19 → min modifier 0.1
    // baseXp = 20 + 1*6 = 26, round(26 * 0.1) = 3
    expect(computeXpDrop(1, 20)).toBe(3);
  });
});
