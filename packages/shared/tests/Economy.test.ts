import { describe, it, expect } from "bun:test";
import { computeLevelModifier, computeGoldDrop } from "../src/Economy.js";

describe("computeLevelModifier", () => {
  it("returns 1.0 at same level", () => {
    expect(computeLevelModifier(10, 10)).toBeCloseTo(1.0, 5);
  });

  it("penalizes 5 levels below (-10% per level)", () => {
    // diff = -5, modifier = 1 + (-5 * 0.1) = 0.5
    expect(computeLevelModifier(5, 10)).toBeCloseTo(0.5, 5);
  });

  it("returns minimum modifier at 6+ levels below", () => {
    expect(computeLevelModifier(3, 10)).toBeCloseTo(0.1, 5);
    expect(computeLevelModifier(1, 10)).toBeCloseTo(0.1, 5);
  });

  it("gives bonus for creatures above player (+5% per level)", () => {
    // diff = 3, modifier = 1 + (3 * 0.05) = 1.15
    expect(computeLevelModifier(13, 10)).toBeCloseTo(1.15, 5);
  });

  it("boundary: -5 uses penalty formula, -6 uses minimum", () => {
    // diff = -5: 1 + (-5 * 0.1) = 0.5
    expect(computeLevelModifier(5, 10)).toBeCloseTo(0.5, 5);
    // diff = -6: returns 0.1
    expect(computeLevelModifier(4, 10)).toBeCloseTo(0.1, 5);
  });
});

describe("computeGoldDrop", () => {
  it("computes normal gold for solo player at same level", () => {
    // baseGold = 5 + 10*3 = 35, modifier = 1.0, party = 1
    // round(35 * 1.0 / 1) = 35
    expect(computeGoldDrop(10, 10, 1)).toBe(35);
  });

  it("splits gold among alive party members", () => {
    // baseGold = 35, modifier = 1.0, party = 3
    // round(35 / 3) = round(11.67) = 12
    expect(computeGoldDrop(10, 10, 3)).toBe(12);
  });

  it("applies anti-farm modifier for low-level creatures", () => {
    // creature 1 vs player 10: diff = -9 → min modifier 0.1
    // baseGold = 5 + 1*3 = 8, round(8 * 0.1 / 1) = round(0.8) = 1
    expect(computeGoldDrop(1, 10, 1)).toBe(1);
  });

  it("returns minimum 1 gold", () => {
    // Even with harsh penalty, floor is 1
    expect(computeGoldDrop(1, 20, 5)).toBe(1);
  });

  it("gives bonus gold for higher-level creatures", () => {
    // creature 15 vs player 10: diff = 5, modifier = 1 + 5*0.05 = 1.25
    // baseGold = 5 + 15*3 = 50, round(50 * 1.25 / 1) = 63
    expect(computeGoldDrop(15, 10, 1)).toBe(63);
  });
});
